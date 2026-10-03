import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OzonProduct } from './entities/ozon-product.entity';
import { Book } from '../books/entities/book.entity';
import { BookPhoto } from '../photos/entities/book-photo.entity';
import { Box } from '../boxes/entities/box.entity';
import { BooksService } from '../books/books.service';
import { OzonApiClient, OzonApiError, type OzonImportInfoItem } from './ozon-api.client';
import { buildOzonImportPayload } from './ozon-payload.builder';
import { mapOzonProductToBook } from './ozon-import.mapper';
import { BookStatus, OZON_ATTR_BRAND, OZON_ATTR_AUTHOR, OZON_ATTR_PUBLISHER, DEFAULT_PRICE } from '@bookscanner/shared';
import type { ResolvedOzonData } from './ozon-payload.builder';

const IMPORTABLE_STATUSES = ['importing'];
// Ozon's product list lags behind the import task — a miss right after import is not proof of failure
const FAILURE_GRACE_MS = 60 * 60 * 1000;
const OZON_IMPORT_BOX_NUMBER = 'OZON_IMPORT';

async function resolveBrand(
  publisher: string | null,
  client: OzonApiClient,
): Promise<{ id: number | undefined; name: string }> {
  if (publisher) {
    const entry = await client.findDictionaryValue(OZON_ATTR_BRAND, publisher);
    if (entry) return { id: entry.id, name: entry.value };

    const stripped = publisher.replace(/^издательство\s+/i, '').trim();
    if (stripped !== publisher) {
      const e2 = await client.findDictionaryValue(OZON_ATTR_BRAND, stripped);
      if (e2) return { id: e2.id, name: e2.value };
    }
  }
  const fallback = await client.findDictionaryValue(OZON_ATTR_BRAND, 'Нет бренда');
  return { id: fallback?.id, name: fallback?.value ?? 'Нет бренда' };
}

async function resolvePublisher(
  publisher: string | null,
  client: OzonApiClient,
): Promise<{ id: number; name: string } | undefined> {
  if (!publisher) return undefined;

  const entry = await client.findDictionaryValue(OZON_ATTR_PUBLISHER, publisher);
  if (entry) return { id: entry.id, name: entry.value };

  const stripped = publisher.replace(/^издательство\s+/i, '').trim();
  if (stripped !== publisher) {
    const e2 = await client.findDictionaryValue(OZON_ATTR_PUBLISHER, stripped);
    if (e2) return { id: e2.id, name: e2.value };
  }

  return undefined;
}

async function resolveAuthors(
  author: string | null,
  client: OzonApiClient,
): Promise<ResolvedOzonData['authors']> {
  if (!author) return [];
  const names = author.split(';').map((s) => s.trim()).filter(Boolean);
  return Promise.all(
    names.map(async (name) => {
      const entry = await client.findDictionaryValue(OZON_ATTR_AUTHOR, name);
      return { value: entry?.value ?? name, dictValueId: entry?.id };
    }),
  );
}

@Injectable()
export class OzonService {
  private readonly logger = new Logger(OzonService.name);
  private reconcileRunning = false;

  constructor(
    @InjectRepository(OzonProduct)
    private readonly ozonProductRepository: Repository<OzonProduct>,
    @InjectRepository(Book)
    private readonly bookRepository: Repository<Book>,
    @InjectRepository(BookPhoto)
    private readonly bookPhotoRepository: Repository<BookPhoto>,
    @InjectRepository(Box)
    private readonly boxRepository: Repository<Box>,
    private readonly booksService: BooksService,
    private readonly ozonApiClient: OzonApiClient,
  ) {}

  async publish(bookId: string, storeId?: string) {
    const book = await this.booksService.findOne(bookId);

    const credentials = storeId
      ? await this.ozonApiClient.getCredentialsForStore(storeId)
      : await this.ozonApiClient.getCredentials();
    if (!credentials) {
      throw new BadRequestException(
        'Ozon API не настроен. Добавьте магазин в настройках администратора или проверьте OZON_API_KEY и OZON_CLIENT_ID.',
      );
    }

    if (book.status === BookStatus.IN_LIBRARY) {
      throw new BadRequestException('Книга добавлена в домашнюю библиотеку и не может быть опубликована на Ozon.');
    }

    if (book.isCopy && !book.isCopyMaster && !book.publishedToOzon) {
      throw new BadRequestException('Книга помечена как копия и не может быть опубликована на Ozon.');
    }

    if (!book.title) {
      throw new BadRequestException('Не заполнено название книги.');
    }

    if (!book.photos || book.photos.length < 2) {
      throw new BadRequestException('Необходимо минимум 2 фото для публикации на Ozon.');
    }

    let ozonProduct = await this.ozonProductRepository.findOne({
      where: { bookId },
    });

    // Retrying a book that was sent before: it may already exist on Ozon despite the error
    // status — then just mark it published instead of importing it again.
    if (ozonProduct && ozonProduct.status !== 'published' && ozonProduct.status !== 'archived' && book.sku) {
      try {
        const allStores = await this.ozonApiClient.getAllStores();
        const found = await this.findProductByOfferIdWithFallback(
          book.sku,
          storeId ?? ozonProduct.storeId ?? null,
          allStores,
        );
        if (found) {
          await this.markPublished(ozonProduct, found.product_id, found.storeId);
          this.logger.log(`Book ${bookId}: already on Ozon (product_id=${found.product_id}), skipped re-import`);
          return {
            ozonProduct,
            alreadyPublished: true,
            message: 'Товар уже есть на Ozon — статус обновлён',
          };
        }
      } catch (error) {
        this.logger.warn(`Book ${bookId}: pre-publish lookup failed, publishing anyway — ${error}`);
      }
    }

    // Check store limits before publishing
    try {
      const limits = await this.ozonApiClient.getProductLimits(storeId);
      if (limits.total.limit > 0 && limits.total.usage >= limits.total.limit) {
        throw new BadRequestException(
          `Исчерпан лимит ассортимента магазина: ${limits.total.usage}/${limits.total.limit} товаров.`,
        );
      }
      if (limits.daily_create.limit > 0 && limits.daily_create.usage >= limits.daily_create.limit) {
        const reset = new Date(limits.daily_create.reset_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        throw new BadRequestException(
          `Исчерпан суточный лимит создания товаров: ${limits.daily_create.usage}/${limits.daily_create.limit}. Сброс в ${reset}.`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`Failed to check limits before publish: ${error}`);
    }

    const [brand, publisher, authors] = await Promise.all([
      resolveBrand(book.publisher, this.ozonApiClient),
      resolvePublisher(book.publisher, this.ozonApiClient),
      resolveAuthors(book.author, this.ozonApiClient),
    ]);

    this.logger.log(
      `Dictionary lookup: brand="${book.publisher}" → id=${brand.id} name="${brand.name}", publisher → ${JSON.stringify(publisher)}, authors="${book.author}" → ${JSON.stringify(authors)}`,
    );

    const payload = buildOzonImportPayload(book, {
      brandDictValueId: brand.id,
      resolvedBrandName: brand.name,
      publisherDictValueId: publisher?.id,
      resolvedPublisherName: publisher?.name,
      authors,
    });

    // Create or update OzonProduct entry
    if (!ozonProduct) {
      ozonProduct = this.ozonProductRepository.create({ bookId });
    }

    ozonProduct.publishPayload = payload;
    ozonProduct.status = 'importing';
    if (storeId) ozonProduct.storeId = storeId;

    try {
      const result = await this.ozonApiClient.importProduct(payload, storeId);
      ozonProduct.taskId = result.task_id;
      ozonProduct = await this.ozonProductRepository.save(ozonProduct);

      // Update book status
      await this.booksService.updateFromExtraction(bookId, {
        status: BookStatus.PENDING_PUBLICATION,
      });

      return {
        ozonProduct,
        message: 'Карточка отправлена на модерацию Ozon',
      };
    } catch (error) {
      ozonProduct.status = 'failed';
      ozonProduct.errorMessage =
        error instanceof OzonApiError
          ? error.responseBody
          : error instanceof Error
            ? error.message
            : 'Неизвестная ошибка';
      await this.ozonProductRepository.save(ozonProduct);

      await this.booksService.updateFromExtraction(bookId, {
        status: BookStatus.PUBLICATION_FAILED,
      });

      if (error instanceof OzonApiError) {
        throw new InternalServerErrorException(
          `Ошибка Ozon API: ${error.message}`,
        );
      }
      throw error;
    }
  }

  async checkStatus(bookId: string) {
    const ozonProduct = await this.ozonProductRepository.findOne({
      where: { bookId },
    });

    if (!ozonProduct) {
      throw new BadRequestException('Карточка не была отправлена на Ozon.');
    }

    if (ozonProduct.status === 'importing' && ozonProduct.taskId) {
      try {
        const allStores = await this.ozonApiClient.getAllStores();
        const { items, taskExpired } = await this.fetchImportTask(
          Number(ozonProduct.taskId),
          ozonProduct.storeId ?? undefined,
        );
        const offerId = ozonProduct.publishPayload?.items?.[0]?.offer_id as string | undefined;
        const item = items.find((i) => i.offer_id === offerId);
        return await this.resolveImport(ozonProduct, item, taskExpired, allStores);
      } catch (error) {
        this.logger.error(`Error checking import for book ${bookId}`, error);
        return { status: ozonProduct.status, message: 'Ошибка проверки статуса импорта' };
      }
    }

    return { status: ozonProduct.status, message: this.getStatusMessage(ozonProduct.status) };
  }

  async checkAllPendingStatuses(): Promise<void> {
    const pending = await this.ozonProductRepository.find({
      where: { status: In(IMPORTABLE_STATUSES) },
    });

    if (pending.length === 0) return;
    this.logger.log(`Checking ${pending.length} pending Ozon products`);

    const allStores = await this.ozonApiClient.getAllStores();

    // Group by store + taskId — one bulk task covers many books, fetch import info once per task.
    // task_id is per seller account, so the store is part of the key.
    const byTask = new Map<string, typeof pending>();
    for (const product of pending) {
      if (product.taskId == null) continue; // never reached Ozon — resetStuckPublications handles these
      const key = `${product.storeId ?? ''}:${product.taskId}`;
      if (!byTask.has(key)) byTask.set(key, []);
      byTask.get(key)!.push(product);
    }

    for (const group of byTask.values()) {
      const taskId = Number(group[0].taskId);
      let task: { items: OzonImportInfoItem[]; taskExpired: boolean };
      try {
        task = await this.fetchImportTask(taskId, group[0].storeId ?? undefined);
      } catch (error) {
        this.logger.error(`Error fetching import info for task ${taskId}`, error);
        continue;
      }

      for (const product of group) {
        try {
          const offerId = product.publishPayload?.items?.[0]?.offer_id as string | undefined;
          const item = task.items.find((i) => i.offer_id === offerId);
          await this.resolveImport(product, item, task.taskExpired, allStores);
        } catch (error) {
          this.logger.error(`Error processing book ${product.bookId} in task ${taskId}`, error);
        }
      }
    }
  }

  /** Ozon keeps import tasks for ~24h; a 404 means the task expired. */
  private async fetchImportTask(
    taskId: number,
    storeId?: string,
  ): Promise<{ items: OzonImportInfoItem[]; taskExpired: boolean }> {
    try {
      return { items: await this.ozonApiClient.getImportInfo(taskId, storeId), taskExpired: false };
    } catch (error) {
      if (error instanceof OzonApiError && error.statusCode === 404) {
        return { items: [], taskExpired: true };
      }
      throw error;
    }
  }

  /**
   * Decides the fate of one 'importing' product from its import-task item.
   * The import task is not the source of truth: Ozon sometimes reports 'failed' for products
   * it actually created, and its product list lags behind the task. So before marking a book
   * failed we look the offer_id up in every store, and we never mark it failed on a lookup
   * error or within FAILURE_GRACE_MS of the publish — the next cron run tries again.
   */
  private async resolveImport(
    op: OzonProduct,
    item: OzonImportInfoItem | undefined,
    taskExpired: boolean,
    allStores: Array<{ id: string }>,
  ): Promise<{ status: string; message: string }> {
    const importing = { status: 'importing', message: 'Импорт в процессе' };
    const published = { status: 'published', message: 'Загружено в Ozon' };

    // A non-zero product_id means Ozon created the product, even if the task says 'failed'
    if (item && (item.status === 'imported' || (item.status === 'failed' && item.product_id > 0))) {
      await this.markPublished(op, item.product_id);
      this.logger.log(`Book ${op.bookId}: imported to Ozon (task status=${item.status}), product_id=${item.product_id}`);
      return published;
    }
    if (item && item.status !== 'failed') return importing;

    // Task says failed, doesn't list our item, or expired — ask Ozon whether the product exists
    const offerId = op.publishPayload?.items?.[0]?.offer_id as string | undefined;
    if (offerId) {
      let found: { product_id: number; storeId?: string } | null;
      try {
        found = await this.findProductByOfferIdWithFallback(offerId, op.storeId ?? null, allStores);
      } catch (error) {
        this.logger.warn(`Book ${op.bookId}: lookup of offer_id=${offerId} failed, will retry — ${error}`);
        return importing;
      }
      if (found) {
        await this.markPublished(op, found.product_id, found.storeId);
        this.logger.log(`Book ${op.bookId}: found on Ozon by offer_id=${offerId}, product_id=${found.product_id}`);
        return published;
      }
    }

    // Task still running and our item just isn't listed yet
    if (!item && !taskExpired) return importing;
    if (Date.now() - op.updatedAt.getTime() < FAILURE_GRACE_MS) return importing;

    if (item) {
      const errorMsg = item.errors?.map((e) => e.message).join('; ') || 'Import failed';
      await this.markFailed(op, errorMsg);
      this.logger.warn(`Book ${op.bookId}: import failed — ${errorMsg}`);
      return { status: 'failed', message: errorMsg };
    }
    await this.markFailed(op, `Task ${op.taskId} expired: product not found on Ozon`);
    this.logger.warn(`Book ${op.bookId}: task ${op.taskId} expired, product not found`);
    return { status: 'failed', message: 'Задача импорта истекла — товар не найден на Ozon' };
  }

  private async markPublished(op: OzonProduct, productId: number | string, storeId?: string) {
    op.ozonProductId = String(productId);
    op.status = 'published';
    op.errorMessage = null as any;
    if (storeId) op.storeId = storeId;
    await this.ozonProductRepository.save(op);
    await this.booksService.updateFromExtraction(op.bookId, {
      status: BookStatus.PUBLISHED,
      publishedToOzon: new Date(),
    });
  }

  private async markFailed(op: OzonProduct, errorMessage: string) {
    op.status = 'failed';
    op.errorMessage = errorMessage;
    await this.ozonProductRepository.save(op);
    await this.booksService.updateFromExtraction(op.bookId, { status: BookStatus.PUBLICATION_FAILED });
  }

  /**
   * Batch-looks up SKUs (= offer_id) in every configured store.
   * Returns sku → where it was found. A store that errors is skipped (logged), so a
   * missing entry means "not found or unknown" — callers must not treat it as proof of absence.
   */
  private async findOnOzonBatch(
    skus: string[],
  ): Promise<Map<string, { productId: number; storeId?: string }>> {
    const found = new Map<string, { productId: number; storeId?: string }>();
    if (!skus.length) return found;

    const stores = await this.ozonApiClient.getAllStores();
    const storeIds: Array<string | undefined> = stores.length ? stores.map((s) => s.id) : [undefined];

    for (const storeId of storeIds) {
      const remaining = skus.filter((sku) => !found.has(sku));
      if (!remaining.length) break;
      try {
        const items = await this.ozonApiClient.findProductsByOfferIds(remaining, storeId);
        for (const item of items) {
          if (item.product_id && !found.has(item.offer_id)) {
            found.set(item.offer_id, { productId: item.product_id, storeId });
          }
        }
      } catch (error) {
        this.logger.error(`findOnOzonBatch: lookup failed for store ${storeId}`, error);
      }
    }
    return found;
  }

  /**
   * Re-checks every PUBLICATION_FAILED book against Ozon and flips the ones that actually
   * exist there to PUBLISHED. Runs hourly from the cron and on demand from the Errors screen.
   */
  async reconcileFailedPublications(): Promise<{ checked: number; published: number }> {
    if (this.reconcileRunning) return { checked: 0, published: 0 };
    this.reconcileRunning = true;
    try {
      const books = await this.bookRepository
        .createQueryBuilder('book')
        .leftJoinAndSelect('book.ozonProduct', 'op')
        .where('book.status = :status', { status: BookStatus.PUBLICATION_FAILED })
        .andWhere('book.sku IS NOT NULL')
        .getMany();
      if (!books.length) return { checked: 0, published: 0 };

      const found = await this.findOnOzonBatch(books.map((b) => b.sku));

      let published = 0;
      for (const book of books) {
        const hit = found.get(book.sku);
        if (!hit) continue;
        try {
          const op = book.ozonProduct ?? this.ozonProductRepository.create({ bookId: book.id });
          await this.markPublished(op, hit.productId, hit.storeId);
          published++;
          this.logger.log(`reconcileFailedPublications: book ${book.id} sku=${book.sku} found on Ozon, product_id=${hit.productId}`);
        } catch (error) {
          this.logger.error(`reconcileFailedPublications: failed to update book ${book.id}`, error);
        }
      }

      this.logger.log(`reconcileFailedPublications: checked=${books.length}, published=${published}`);
      return { checked: books.length, published };
    } finally {
      this.reconcileRunning = false;
    }
  }

  async publishBulk(bookIds: string[], storeId?: string) {
    const BATCH_SIZE = 100;

    // 1. Validate credentials
    const credentials = storeId
      ? await this.ozonApiClient.getCredentialsForStore(storeId)
      : await this.ozonApiClient.getCredentials();
    if (!credentials) {
      throw new BadRequestException(
        'Ozon API не настроен. Добавьте магазин в настройках администратора.',
      );
    }

    // 2. Check limits upfront
    try {
      const limits = await this.ozonApiClient.getProductLimits(storeId);
      if (limits.total.limit > 0 && limits.total.usage >= limits.total.limit) {
        throw new BadRequestException(
          `Исчерпан лимит ассортимента: ${limits.total.usage}/${limits.total.limit} товаров.`,
        );
      }
      if (limits.daily_create.limit > 0) {
        const remaining = limits.daily_create.limit - limits.daily_create.usage;
        if (remaining <= 0) {
          const reset = new Date(limits.daily_create.reset_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          });
          throw new BadRequestException(
            `Исчерпан суточный лимит создания товаров. Сброс в ${reset}.`,
          );
        }
        if (remaining < bookIds.length) {
          throw new BadRequestException(
            `Суточный лимит: можно создать ещё ${remaining} товаров, запрошено ${bookIds.length}.`,
          );
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`Failed to check limits before bulk publish: ${error}`);
    }

    // 3. Fetch all books
    let books = await Promise.all(bookIds.map((id) => this.booksService.findOne(id)));

    // 3a. Books sent before may already exist on Ozon despite the error status —
    // mark those published instead of importing them again.
    const alreadyPublished: string[] = [];
    const retried = books.filter(
      (b) => b.ozonProduct && b.ozonProduct.status !== 'published' && b.ozonProduct.status !== 'archived' && b.sku,
    );
    if (retried.length) {
      const found = await this.findOnOzonBatch(retried.map((b) => b.sku));
      for (const book of retried) {
        const hit = found.get(book.sku);
        if (!hit) continue;
        try {
          await this.markPublished(book.ozonProduct, hit.productId, hit.storeId);
          alreadyPublished.push(book.id);
        } catch (error) {
          this.logger.error(`publishBulk: failed to mark book ${book.id} as already published`, error);
        }
      }
      if (alreadyPublished.length) {
        this.logger.log(`publishBulk: ${alreadyPublished.length} books already on Ozon, skipped re-import`);
        books = books.filter((b) => !alreadyPublished.includes(b.id));
      }
    }

    // 4. Dictionary lookups — brand and authors per book.
    // OzonApiClient caches results, so duplicate publisher/author lookups are free after the first.
    // Process in concurrency-limited batches to avoid flooding Ozon API with hundreds of parallel requests.
    const validForLookup = books.filter((b) => b.title && b.photos?.length >= 2);
    const resolvedMap = new Map<string, { brand: { id: number | undefined; name: string }; publisher: { id: number; name: string } | undefined; authors: ResolvedOzonData['authors'] }>();
    const LOOKUP_CONCURRENCY = 5;
    for (let i = 0; i < validForLookup.length; i += LOOKUP_CONCURRENCY) {
      await Promise.all(
        validForLookup.slice(i, i + LOOKUP_CONCURRENCY).map(async (book) => {
          const [brand, publisher, authors] = await Promise.all([
            resolveBrand(book.publisher, this.ozonApiClient),
            resolvePublisher(book.publisher, this.ozonApiClient),
            resolveAuthors(book.author, this.ozonApiClient),
          ]);
          resolvedMap.set(book.id, { brand, publisher, authors });
        }),
      );
    }

    // 5. Split into valid and skipped
    type BatchEntry = { book: (typeof books)[0]; payload: Record<string, unknown>; item: unknown };
    const validEntries: BatchEntry[] = [];
    const failed: { id: string; title?: string; error: string }[] = [];

    for (const book of books) {
      if (book.status === BookStatus.IN_LIBRARY) {
        failed.push({ id: book.id, title: book.title, error: 'В домашней библиотеке — публикация на Ozon заблокирована' });
        continue;
      }
      if (book.isCopy && !book.isCopyMaster && !book.publishedToOzon) {
        failed.push({ id: book.id, title: book.title, error: 'Копия — публикация на Ozon заблокирована' });
        continue;
      }
      if (!book.title) {
        failed.push({ id: book.id, title: book.title, error: 'Не заполнено название' });
        continue;
      }
      if (!book.photos || book.photos.length < 2) {
        failed.push({ id: book.id, title: book.title, error: 'Необходимо минимум 2 фото' });
        continue;
      }
      const r = resolvedMap.get(book.id);
      const payload = buildOzonImportPayload(book, {
        brandDictValueId: r?.brand.id,
        resolvedBrandName: r?.brand.name,
        publisherDictValueId: r?.publisher?.id,
        resolvedPublisherName: r?.publisher?.name,
        authors: r?.authors,
      });
      validEntries.push({ book, payload, item: (payload.items as unknown[])[0] });
    }

    // 6. Import in batches of BATCH_SIZE
    const succeeded: string[] = [];

    for (let i = 0; i < validEntries.length; i += BATCH_SIZE) {
      const batch = validEntries.slice(i, i + BATCH_SIZE);
      try {
        const result = await this.ozonApiClient.importProduct(
          { items: batch.map((e) => e.item) },
          storeId,
        );

        await Promise.all(
          batch.map(async ({ book, payload }) => {
            let ozonProduct = await this.ozonProductRepository.findOne({ where: { bookId: book.id } });
            if (!ozonProduct) ozonProduct = this.ozonProductRepository.create({ bookId: book.id });
            ozonProduct.publishPayload = payload;
            ozonProduct.taskId = result.task_id;
            ozonProduct.status = 'importing';
            if (storeId) ozonProduct.storeId = storeId;
            await this.ozonProductRepository.save(ozonProduct);
            await this.booksService.updateFromExtraction(book.id, { status: BookStatus.PENDING_PUBLICATION });
            succeeded.push(book.id);
          }),
        );

        this.logger.log(`Bulk batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} books → task_id=${result.task_id}`);
      } catch (error) {
        const errMsg =
          error instanceof OzonApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Неизвестная ошибка';

        this.logger.error(`Bulk batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${errMsg}`);

        await Promise.all(
          batch.map(async ({ book }) => {
            let ozonProduct = await this.ozonProductRepository.findOne({ where: { bookId: book.id } });
            if (!ozonProduct) ozonProduct = this.ozonProductRepository.create({ bookId: book.id });
            ozonProduct.status = 'failed';
            ozonProduct.errorMessage = errMsg;
            await this.ozonProductRepository.save(ozonProduct);
            await this.booksService.updateFromExtraction(book.id, { status: BookStatus.PUBLICATION_FAILED });
            failed.push({ id: book.id, title: book.title, error: errMsg });
          }),
        );
      }
    }

    return {
      total: bookIds.length,
      succeeded: succeeded.length,
      alreadyPublished: alreadyPublished.length,
      failed: failed.length,
      failedBooks: failed,
      message: alreadyPublished.length
        ? `Отправлено на модерацию: ${succeeded.length} из ${bookIds.length}, уже на Ozon: ${alreadyPublished.length}`
        : `Отправлено на модерацию: ${succeeded.length} из ${bookIds.length}`,
    };
  }

  async getAllNewProductIds(storeId?: string, visibility?: string): Promise<{ productIds: number[]; total: number }> {
    const credentials = storeId
      ? await this.ozonApiClient.getCredentialsForStore(storeId)
      : await this.ozonApiClient.getCredentials();
    if (!credentials) throw new BadRequestException('Ozon API не настроен.');

    // Single full traversal of Ozon product list
    const allItems: Array<{ product_id: number; offer_id: string }> = [];
    let lastId = '';
    do {
      const result = await this.ozonApiClient.getProductList(storeId, lastId, 1000, visibility);
      allItems.push(...result.items);
      lastId = result.last_id;
      if (!lastId || result.items.length < 1000) break;
    } while (true);

    if (!allItems.length) return { productIds: [], total: 0 };

    // Check which offer_ids already exist in DB
    const offerIds = [...new Set(allItems.map((i) => i.offer_id))];
    const existing = await this.bookRepository.find({
      where: offerIds.map((sku) => ({ sku })),
      select: ['sku'],
    });
    const existingSkus = new Set(existing.map((b) => b.sku));

    const newItems = allItems.filter(
      (item, idx, arr) =>
        !existingSkus.has(item.offer_id) &&
        arr.findIndex((x) => x.offer_id === item.offer_id) === idx, // deduplicate
    );

    return { productIds: newItems.map((i) => i.product_id), total: allItems.length };
  }

  async listImportableProducts(
    storeId?: string,
    page = 1,
    limit = 50,
    visibility?: string,
  ): Promise<{
    items: Array<{
      productId: number;
      offerId: string;
      name: string;
      alreadyImported: boolean;
      bookId?: string;
    }>;
    total: number;
    page: number;
  }> {
    const credentials = storeId
      ? await this.ozonApiClient.getCredentialsForStore(storeId)
      : await this.ozonApiClient.getCredentials();
    if (!credentials) {
      throw new BadRequestException('Ozon API не настроен.');
    }

    // Ozon uses last_id cursor pagination — calculate which page to fetch
    const pageSize = Math.min(limit, 100);
    const skip = (page - 1) * pageSize;

    // Traverse pages using last_id cursor to reach requested page
    let lastId = '';
    let fetchedItems: Array<{ product_id: number; offer_id: string; name: string }> = [];
    let total = 0;
    let accumulated = 0;

    while (accumulated < skip + pageSize) {
      const batchSize = Math.min(100, skip + pageSize - accumulated);
      const result = await this.ozonApiClient.getProductList(storeId, lastId, batchSize, visibility);
      total = result.total;

      if (!result.items || result.items.length === 0) break;

      fetchedItems = result.items;
      accumulated += result.items.length;
      lastId = result.last_id;

      if (!lastId || result.items.length < batchSize) break;
    }

    // Take only the items for the requested page
    const pageItems = fetchedItems.slice(Math.max(0, fetchedItems.length - pageSize));

    // Check which items are already in our DB (match by sku = offer_id)
    const offerIds = pageItems.map((i) => i.offer_id);
    const existingBooks = offerIds.length > 0
      ? await this.bookRepository.find({
          where: offerIds.map((sku) => ({ sku })),
          select: ['id', 'sku'],
        })
      : [];

    const existingMap = new Map(existingBooks.map((b) => [b.sku, b.id]));

    return {
      items: pageItems.map((item) => ({
        productId: item.product_id,
        offerId: item.offer_id,
        name: item.name,
        alreadyImported: existingMap.has(item.offer_id),
        bookId: existingMap.get(item.offer_id),
      })),
      total,
      page,
    };
  }

  async importProducts(
    productIds: number[],
    adminUserId: string,
    storeId?: string,
    isArchived = false,
  ): Promise<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    failedItems: Array<{ productId: number; error: string }>;
  }> {
    if (!productIds.length) {
      return { total: 0, imported: 0, skipped: 0, failed: 0, failedItems: [] };
    }

    // Find or create the import box for this admin
    let importBox = await this.boxRepository.findOne({
      where: { boxNumber: OZON_IMPORT_BOX_NUMBER, createdById: adminUserId },
    });
    if (!importBox) {
      importBox = this.boxRepository.create({
        boxNumber: OZON_IMPORT_BOX_NUMBER,
        description: 'Импортировано с Озона',
        createdById: adminUserId,
      });
      importBox = await this.boxRepository.save(importBox);
    }

    // Fetch full product data in batches of 1000
    const BATCH = 1000;
    const allAttributes: Awaited<ReturnType<typeof this.ozonApiClient.getProductAttributesList>> = [];
    for (let i = 0; i < productIds.length; i += BATCH) {
      const batch = productIds.slice(i, i + BATCH);
      const attrs = await this.ozonApiClient.getProductAttributesList(batch, storeId);
      allAttributes.push(...attrs);
    }

    // Fetch prices for all products (batches of 1000 offer_ids)
    const offerIds = allAttributes.map((p) => p.offer_id);
    const priceMap = new Map<string, number>();
    const PRICE_BATCH = 1000;
    for (let i = 0; i < offerIds.length; i += PRICE_BATCH) {
      const batch = offerIds.slice(i, i + PRICE_BATCH);
      const batchPrices = await this.ozonApiClient.getProductPrices(batch, storeId);
      for (const [offerId, price] of batchPrices) {
        priceMap.set(offerId, price);
      }
    }

    // Check which SKUs already exist
    const existing = offerIds.length > 0
      ? await this.bookRepository.find({
          where: offerIds.map((sku) => ({ sku })),
          select: ['id', 'sku'],
        })
      : [];
    const existingSkus = new Set(existing.map((b) => b.sku));

    let imported = 0;
    let skipped = 0;
    const failedItems: Array<{ productId: number; error: string }> = [];

    for (const ozonProduct of allAttributes) {
      if (existingSkus.has(ozonProduct.offer_id)) {
        skipped++;
        continue;
      }
      // Track within this import run to handle duplicate offer_ids from Ozon pagination
      existingSkus.add(ozonProduct.offer_id);

      try {
        const data = mapOzonProductToBook(ozonProduct);

        // Create Book record
        const book = this.bookRepository.create({
          sku: data.sku,
          title: data.title,
          author: data.author,
          isbn: data.isbn,
          publisher: data.publisher,
          yearPublished: data.yearPublished,
          pageCount: data.pageCount,
          language: data.language || 'русский',
          annotation: data.annotation,
          hashtags: data.hashtags,
          condition: data.condition || 'Хорошая',
          bookType: data.bookType || 'Печатная книга',
          direction: data.direction || 'проза',
          coverType: data.coverType,
          paperType: data.paperType,
          weightGross: data.weightGross,
          dimensions: data.dimensions || { width: 0, height: 35, depth: 0 },
          price: priceMap.get(ozonProduct.offer_id) ?? DEFAULT_PRICE,
          status: isArchived ? BookStatus.ARCHIVED : BookStatus.PUBLISHED,
          publishedToOzon: new Date(),
          boxId: importBox.id,
          createdById: adminUserId,
        });
        const savedBook = await this.bookRepository.save(book);

        // Create BookPhoto records from Ozon image URLs
        for (let i = 0; i < data.imageUrls.length; i++) {
          const photo = this.bookPhotoRepository.create({
            bookId: savedBook.id,
            fileUrl: data.imageUrls[i],
            sortOrder: i,
            originalFilename: `ozon_${i + 1}.jpg`,
            mimeType: 'image/jpeg',
          });
          await this.bookPhotoRepository.save(photo);
        }

        // Create OzonProduct record
        const ozonProductRecord = this.ozonProductRepository.create({
          bookId: savedBook.id,
          ozonProductId: data.ozonProductId,
          status: 'published',
          storeId: storeId,
        });
        await this.ozonProductRepository.save(ozonProductRecord);

        imported++;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
        this.logger.error(`Failed to import ozon product ${ozonProduct.id}: ${errMsg}`);
        failedItems.push({ productId: ozonProduct.id, error: errMsg });
      }
    }

    return {
      total: productIds.length,
      imported,
      skipped,
      failed: failedItems.length,
      failedItems,
    };
  }

  async syncArchivedStatus(): Promise<{ checked: number; archived: number }> {
    this.logger.log('syncArchivedStatus: started');

    const stores = await this.ozonApiClient.getAllStores();
    const storeIds: Array<string | null> = stores.length ? stores.map((s) => s.id) : [null];

    const archivedOfferIds = new Set<string>();
    for (const storeId of storeIds) {
      let lastId = '';
      try {
        do {
          const result = await this.ozonApiClient.getProductList(storeId ?? undefined, lastId, 1000, 'ARCHIVED');
          for (const item of result.items) archivedOfferIds.add(item.offer_id);
          lastId = result.last_id;
          if (!lastId || result.items.length < 1000) break;
        } while (true);
        this.logger.log(`syncArchivedStatus: store=${storeId} — ${archivedOfferIds.size} archived offer_ids total`);
      } catch (err) {
        this.logger.error(`syncArchivedStatus: failed to fetch archive for store ${storeId}`, err);
      }
    }

    if (!archivedOfferIds.size) {
      this.logger.log('syncArchivedStatus: no archived products found on Ozon');
      return { checked: 0, archived: 0 };
    }

    const published = await this.ozonProductRepository
      .createQueryBuilder('op')
      .innerJoinAndSelect('op.book', 'book')
      .where('op.status = :status', { status: 'published' })
      .getMany();

    this.logger.log(`syncArchivedStatus: checking ${published.length} published records against ${archivedOfferIds.size} archived offer_ids`);

    let archived = 0;
    for (const op of published) {
      if (op.book?.sku && archivedOfferIds.has(op.book.sku)) {
        op.status = 'archived';
        await this.ozonProductRepository.save(op);
        await this.booksService.updateFromExtraction(op.bookId, { status: BookStatus.ARCHIVED });
        archived++;
        this.logger.log(`syncArchivedStatus: book ${op.bookId} sku=${op.book.sku} archived`);
      }
    }

    this.logger.log(`syncArchivedStatus: checked=${published.length}, archived=${archived}`);
    return { checked: published.length, archived };
  }

  async syncOzonStatus(): Promise<{ checked: number; archived: number; restored: number }> {
    this.logger.log('syncOzonStatus: started');

    const stores = await this.ozonApiClient.getAllStores();
    const storeIds: Array<string | null> = stores.length ? stores.map((s) => s.id) : [null];

    // Build two sets: all offer_ids present on Ozon, and those that are archived
    const allOfferIds = new Set<string>();
    const archivedOfferIds = new Set<string>();

    for (const storeId of storeIds) {
      for (const visibility of [undefined, 'ARCHIVED'] as Array<string | undefined>) {
        let lastId = '';
        try {
          do {
            const result = await this.ozonApiClient.getProductList(storeId ?? undefined, lastId, 1000, visibility);
            for (const item of result.items) {
              allOfferIds.add(item.offer_id);
              if (visibility === 'ARCHIVED') archivedOfferIds.add(item.offer_id);
            }
            lastId = result.last_id;
            if (!lastId || result.items.length < 1000) break;
          } while (true);
        } catch (err) {
          this.logger.error(`syncOzonStatus: failed to fetch store=${storeId} visibility=${visibility ?? 'ALL'}`, err);
        }
      }
      this.logger.log(`syncOzonStatus: store=${storeId} — total=${allOfferIds.size} archived=${archivedOfferIds.size}`);
    }

    const tracked = await this.ozonProductRepository
      .createQueryBuilder('op')
      .innerJoinAndSelect('op.book', 'book')
      .where('op.status IN (:...statuses)', { statuses: ['published', 'archived'] })
      .getMany();

    this.logger.log(`syncOzonStatus: checking ${tracked.length} tracked records`);

    let archived = 0;
    let restored = 0;

    for (const op of tracked) {
      const sku = op.book?.sku;
      if (!sku || !allOfferIds.has(sku)) continue;

      if (archivedOfferIds.has(sku) && op.status !== 'archived') {
        op.status = 'archived';
        await this.ozonProductRepository.save(op);
        await this.booksService.updateFromExtraction(op.bookId, { status: BookStatus.ARCHIVED });
        archived++;
        this.logger.log(`syncOzonStatus: archived book ${op.bookId} sku=${sku}`);
      } else if (!archivedOfferIds.has(sku) && op.status === 'archived') {
        op.status = 'published';
        await this.ozonProductRepository.save(op);
        await this.booksService.updateFromExtraction(op.bookId, { status: BookStatus.PUBLISHED });
        restored++;
        this.logger.log(`syncOzonStatus: restored book ${op.bookId} sku=${sku}`);
      }
    }

    this.logger.log(`syncOzonStatus: checked=${tracked.length}, archived=${archived}, restored=${restored}`);
    return { checked: tracked.length, archived, restored };
  }

  async getSyncDiff(storeId?: string): Promise<{
    counts: { ozonActive: number; ozonArchived: number; systemPublished: number; systemArchived: number };
    onOzonNotInSystem: Array<{ productId: number; offerId: string; name: string; visibility: string; storeId: string | null }>;
    inSystemNotOnOzon: Array<{ bookId: string; sku: string; title: string; status: string }>;
  }> {
    const stores = storeId
      ? [{ id: storeId }]
      : await this.ozonApiClient.getAllStores();
    const storeIds: Array<string | null> = stores.length ? stores.map((s: { id: string }) => s.id) : [null];

    const activeMap = new Map<string, { productId: number; offerId: string; name: string; storeId: string | null }>();
    const archivedMap = new Map<string, { productId: number; offerId: string; name: string; storeId: string | null }>();

    for (const sid of storeIds) {
      for (const visibility of ['ACTIVE', 'ARCHIVED'] as const) {
        let lastId = '';
        try {
          do {
            const result = await this.ozonApiClient.getProductList(sid ?? undefined, lastId, 1000, visibility);
            for (const item of result.items) {
              const map = visibility === 'ACTIVE' ? activeMap : archivedMap;
              if (!map.has(item.offer_id)) {
                map.set(item.offer_id, { productId: item.product_id, offerId: item.offer_id, name: item.name, storeId: sid });
              }
            }
            lastId = result.last_id;
            if (!lastId || result.items.length < 1000) break;
          } while (true);
        } catch (err) {
          this.logger.warn(`getSyncDiff: failed to fetch ${visibility} for store ${sid}`, err);
        }
      }
    }

    const systemBooks = await this.bookRepository
      .createQueryBuilder('book')
      .where('book.status IN (:...statuses)', { statuses: [BookStatus.PUBLISHED, BookStatus.ARCHIVED] })
      .andWhere('book.sku IS NOT NULL')
      .select(['book.id', 'book.sku', 'book.title', 'book.status'])
      .getMany();

    const systemSkuSet = new Set(systemBooks.map((b) => b.sku));
    const allOzonOfferIds = new Set([...activeMap.keys(), ...archivedMap.keys()]);

    const onOzonNotInSystem: Array<{ productId: number; offerId: string; name: string; visibility: string; storeId: string | null }> = [];
    for (const [offerId, item] of activeMap) {
      if (!systemSkuSet.has(offerId)) onOzonNotInSystem.push({ ...item, visibility: 'ACTIVE' });
    }
    for (const [offerId, item] of archivedMap) {
      if (!systemSkuSet.has(offerId)) onOzonNotInSystem.push({ ...item, visibility: 'ARCHIVED' });
    }

    const inSystemNotOnOzon = systemBooks
      .filter((b) => !allOzonOfferIds.has(b.sku))
      .map((b) => ({ bookId: b.id, sku: b.sku, title: b.title, status: b.status }));

    return {
      counts: {
        ozonActive: activeMap.size,
        ozonArchived: archivedMap.size,
        systemPublished: systemBooks.filter((b) => b.status === BookStatus.PUBLISHED).length,
        systemArchived: systemBooks.filter((b) => b.status === BookStatus.ARCHIVED).length,
      },
      onOzonNotInSystem,
      inSystemNotOnOzon,
    };
  }

  async priceLookup(query: string) {
    this.logger.log(`Price lookup: ${query}`);
    return {
      query,
      averagePrice: 0,
      results: [],
      message: 'Поиск цен будет реализован при интеграции с Ozon API',
    };
  }

  /**
   * Looks the offer_id up in the given store first, then in every other store.
   * Returns null only when every lookup succeeded and none found the product; if some store
   * errored (rate limit, timeout) and nothing was found, rethrows — absence is not proven.
   */
  private async findProductByOfferIdWithFallback(
    offerId: string,
    storeId: string | null,
    allStores: Array<{ id: string }>,
  ): Promise<{ product_id: number; storeId?: string } | null> {
    const storeIds = storeId
      ? [storeId, ...allStores.map((s) => s.id).filter((id) => id !== storeId)]
      : allStores.map((s) => s.id);

    if (!storeIds.length) {
      const found = await this.ozonApiClient.findProductByOfferId(offerId);
      return found?.product_id ? { product_id: found.product_id } : null;
    }

    let lookupError: unknown = null;
    for (const id of storeIds) {
      try {
        const found = await this.ozonApiClient.findProductByOfferId(offerId, id);
        if (found?.product_id) return { product_id: found.product_id, storeId: id };
      } catch (error) {
        lookupError = error;
      }
    }

    if (lookupError) throw lookupError;
    return null;
  }

  private getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      draft: 'Черновик',
      importing: 'Загружается в Ozon',
      published: 'Загружено в Ozon',
      failed: 'Ошибка публикации',
    };
    return messages[status] || status;
  }

  /**
   * Находит книги, зависшие в статусе PENDING_PUBLICATION (ozon_product.status='importing')
   * дольше 24 часов. Для каждой пытается найти товар на Ozon по offer_id:
   *   - нашли → помечаем как published
   *   - не нашли → сбрасываем книгу в PUBLICATION_FAILED
   *   - ошибка поиска → оставляем как есть, повторим в следующий раз
   */
  async resetStuckPublications(): Promise<{ checked: number; published: number; failed: number }> {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stuck = await this.ozonProductRepository
      .createQueryBuilder('op')
      .where('op.status = :status', { status: 'importing' })
      .andWhere('op.ozonProductId IS NULL')
      .andWhere('op.updatedAt < :threshold', { threshold })
      .getMany();

    if (!stuck.length) {
      return { checked: 0, published: 0, failed: 0 };
    }

    let published = 0;
    let failed = 0;
    const allStores = await this.ozonApiClient.getAllStores();

    for (const op of stuck) {
      const offerId = op.publishPayload?.items?.[0]?.offer_id as string | undefined;

      if (offerId) {
        let found: { product_id: number; storeId?: string } | null;
        try {
          found = await this.findProductByOfferIdWithFallback(offerId, op.storeId ?? null, allStores);
        } catch (error) {
          this.logger.warn(`resetStuckPublications: lookup failed for book ${op.bookId}, skipping — ${error}`);
          continue;
        }
        if (found) {
          await this.markPublished(op, found.product_id, found.storeId);
          published++;
          continue;
        }
      }

      await this.markFailed(op, 'Publication task expired: product not found on Ozon. Please retry.');
      failed++;
    }

    this.logger.log(`resetStuckPublications: checked=${stuck.length}, published=${published}, failed=${failed}`);
    return { checked: stuck.length, published, failed };
  }

  /**
   * Проходит по всем настроенным магазинам Ozon, получает список их товаров
   * и проставляет storeId в записи ozon_products, где он ещё не заполнен.
   * Матчинг только по sku (= offer_id) — ozonProductId бывает null.
   */
  async backfillStoreIds(): Promise<{ updated: number; stores: number }> {
    const stores = await this.ozonApiClient.getAllStores();
    if (!stores.length) {
      return { updated: 0, stores: 0 };
    }

    // Load all ozon_products without storeId that are published on Ozon.
    // Records with null ozonProductId were never accepted by Ozon (failed/expired),
    // so they won't appear in getProductList and can't be matched.
    const untagged = await this.ozonProductRepository
      .createQueryBuilder('op')
      .innerJoinAndSelect('op.book', 'book')
      .where('op.storeId IS NULL')
      .andWhere('op.ozonProductId IS NOT NULL')
      .getMany();

    if (!untagged.length) {
      return { updated: 0, stores: stores.length };
    }

    // Build lookup map: sku → ozon_product record
    const bySku = new Map<string, (typeof untagged)[0]>();
    for (const op of untagged) {
      if (op.book?.sku) bySku.set(op.book.sku, op);
    }

    let updated = 0;

    for (const store of stores) {
      const toUpdate: Array<{ id: string; storeId: string }> = [];
      let lastId = '';

      do {
        let page: Awaited<ReturnType<typeof this.ozonApiClient.getProductList>>;
        try {
          page = await this.ozonApiClient.getProductList(store.id, lastId, 1000);
        } catch (err) {
          this.logger.warn(`backfillStoreIds: failed for store ${store.id}: ${err}`);
          break;
        }

        for (const item of page.items) {
          const record = bySku.get(item.offer_id);
          if (record) {
            toUpdate.push({ id: record.id, storeId: store.id });
            bySku.delete(item.offer_id);
          }
        }

        lastId = page.last_id;
        if (!lastId || page.items.length < 1000) break;
      } while (bySku.size > 0);

      if (toUpdate.length > 0) {
        await this.ozonProductRepository.save(
          toUpdate.map(({ id, storeId }) => ({ id, storeId })),
        );
        updated += toUpdate.length;
      }

      if (bySku.size === 0) break;
    }

    return { updated, stores: stores.length };
  }
}
