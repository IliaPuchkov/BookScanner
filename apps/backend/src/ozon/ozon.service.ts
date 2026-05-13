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
import { OzonApiClient, OzonApiError } from './ozon-api.client';
import { buildOzonImportPayload } from './ozon-payload.builder';
import { mapOzonProductToBook } from './ozon-import.mapper';
import { BookStatus, OZON_ATTR_BRAND, OZON_ATTR_AUTHOR, OZON_ATTR_PUBLISHER, DEFAULT_PRICE } from '@bookscanner/shared';
import type { ResolvedOzonData } from './ozon-payload.builder';

const IMPORTABLE_STATUSES = ['importing'];
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

    if (book.isCopy && !book.publishedToOzon) {
      throw new BadRequestException('Книга помечена как копия и не может быть опубликована на Ozon.');
    }

    if (!book.title) {
      throw new BadRequestException('Не заполнено название книги.');
    }

    if (!book.photos || book.photos.length < 2) {
      throw new BadRequestException('Необходимо минимум 2 фото для публикации на Ozon.');
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
    let ozonProduct = await this.ozonProductRepository.findOne({
      where: { bookId },
    });

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

    // Phase 1: Check import status
    if (ozonProduct.status === 'importing' && ozonProduct.taskId) {
      try {
        const items = await this.ozonApiClient.getImportInfo(
          Number(ozonProduct.taskId),
        );

        const item = items.find((i) => i.offer_id === ozonProduct.publishPayload?.items?.[0]?.offer_id);

        if (!item) {
          // Task returned but our offer_id not found — treat as expired/stuck
          const offerId = ozonProduct.publishPayload?.items?.[0]?.offer_id as string | undefined;
          if (offerId) {
            try {
              const found = await this.ozonApiClient.findProductByOfferId(offerId, ozonProduct.storeId ?? undefined);
              if (found?.product_id) {
                ozonProduct.ozonProductId = String(found.product_id);
                ozonProduct.status = 'published';
                await this.ozonProductRepository.save(ozonProduct);
                await this.booksService.updateFromExtraction(bookId, {
                  status: BookStatus.PUBLISHED,
                  publishedToOzon: new Date(),
                });
                return { status: 'published', message: 'Загружено в Ozon' };
              }
            } catch { /* not found */ }
          }
          return { status: ozonProduct.status, message: 'Импорт в процессе' };
        }

        if (item.status === 'imported') {
          ozonProduct.ozonProductId = String(item.product_id);
          ozonProduct.status = 'published';
          await this.ozonProductRepository.save(ozonProduct);

          await this.booksService.updateFromExtraction(bookId, {
            status: BookStatus.PUBLISHED,
            publishedToOzon: new Date(),
          });

          this.logger.log(`Book ${bookId}: successfully imported to Ozon, product_id=${item.product_id}`);
          return { status: 'published', message: 'Загружено в Ozon' };
        } else if (item.status === 'failed') {
          const errorMsg = item.errors?.map((e) => e.message).join('; ') || 'Import failed';
          // Ozon sometimes reports 'failed' in the import task even when the product was created.
          // Verify by searching on Ozon before marking as failed.
          const offerId = ozonProduct.publishPayload?.items?.[0]?.offer_id as string | undefined;
          if (offerId) {
            try {
              const found = await this.ozonApiClient.findProductByOfferId(offerId, ozonProduct.storeId ?? undefined);
              if (found?.product_id) {
                ozonProduct.ozonProductId = String(found.product_id);
                ozonProduct.status = 'published';
                await this.ozonProductRepository.save(ozonProduct);
                await this.booksService.updateFromExtraction(bookId, { status: BookStatus.PUBLISHED, publishedToOzon: new Date() });
                this.logger.log(`Book ${bookId}: task reported failed but product found on Ozon by offer_id=${offerId}, product_id=${found.product_id}`);
                return { status: 'published', message: 'Загружено в Ozon' };
              }
            } catch { /* not found, fall through to mark as failed */ }
          }
          ozonProduct.status = 'failed';
          ozonProduct.errorMessage = errorMsg;
          await this.ozonProductRepository.save(ozonProduct);

          await this.booksService.updateFromExtraction(bookId, {
            status: BookStatus.PUBLICATION_FAILED,
          });

          this.logger.warn(`Book ${bookId}: import failed — ${errorMsg}`);
          return { status: 'failed', message: errorMsg };
        } else {
          return { status: 'importing', message: 'Импорт в процессе' };
        }
      } catch (error) {
        // Ozon хранит task только ~24ч. Если task не найден — ищем товар по offer_id
        if (error instanceof OzonApiError && error.statusCode === 404) {
          const offerId = ozonProduct.publishPayload?.items?.[0]?.offer_id as string | undefined;
          if (offerId) {
            try {
              const found = await this.ozonApiClient.findProductByOfferId(offerId, ozonProduct.storeId ?? undefined);
              if (found?.product_id) {
                ozonProduct.ozonProductId = String(found.product_id);
                ozonProduct.status = 'published';
                await this.ozonProductRepository.save(ozonProduct);
                await this.booksService.updateFromExtraction(bookId, {
                  status: BookStatus.PUBLISHED,
                  publishedToOzon: new Date(),
                });
                this.logger.log(`Book ${bookId}: task expired, product found by offer_id=${offerId}, product_id=${found.product_id}`);
                return { status: 'published', message: 'Загружено в Ozon' };
              }
            } catch { /* not found */ }
          }
          ozonProduct.status = 'failed';
          ozonProduct.errorMessage = `Task ${ozonProduct.taskId} expired: product not found on Ozon`;
          await this.ozonProductRepository.save(ozonProduct);
          await this.booksService.updateFromExtraction(bookId, { status: BookStatus.PUBLICATION_FAILED });
          this.logger.warn(`Book ${bookId}: task ${ozonProduct.taskId} expired, product not found`);
          return { status: 'failed', message: 'Задача импорта истекла — товар не найден на Ozon' };
        }

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

    // Group by taskId — one bulk task covers many books, fetch import info once per task
    const byTask = new Map<string, typeof pending>();
    for (const product of pending) {
      const key = product.taskId != null ? String(product.taskId) : `no-task-${product.bookId}`;
      if (!byTask.has(key)) byTask.set(key, []);
      byTask.get(key)!.push(product);
    }

    for (const [taskKey, group] of byTask) {
      if (taskKey.startsWith('no-task-')) {
        for (const product of group) {
          try { await this.checkStatus(product.bookId); } catch (e) {
            this.logger.error(`Error checking status for book ${product.bookId}`, e);
          }
        }
        continue;
      }

      const taskId = Number(taskKey);
      let items: Awaited<ReturnType<typeof this.ozonApiClient.getImportInfo>> | null = null;
      let taskExpired = false;

      try {
        items = await this.ozonApiClient.getImportInfo(taskId);
      } catch (error) {
        if (error instanceof OzonApiError && error.statusCode === 404) {
          taskExpired = true;
        } else {
          this.logger.error(`Error fetching import info for task ${taskId}`, error);
          continue;
        }
      }

      for (const product of group) {
        try {
          const offerId = product.publishPayload?.items?.[0]?.offer_id as string | undefined;

          if (taskExpired) {
            if (offerId) {
              const found = await this.ozonApiClient.findProductByOfferId(offerId, product.storeId ?? undefined);
              if (found?.product_id) {
                product.ozonProductId = String(found.product_id);
                product.status = 'published';
                await this.ozonProductRepository.save(product);
                await this.booksService.updateFromExtraction(product.bookId, { status: BookStatus.PUBLISHED, publishedToOzon: new Date() });
                this.logger.log(`Book ${product.bookId}: task expired, found on Ozon product_id=${found.product_id}`);
                continue;
              }
            }
            product.status = 'failed';
            product.errorMessage = `Task ${taskId} expired: product not found on Ozon`;
            await this.ozonProductRepository.save(product);
            await this.booksService.updateFromExtraction(product.bookId, { status: BookStatus.PUBLICATION_FAILED });
            this.logger.warn(`Book ${product.bookId}: task ${taskId} expired, product not found`);
            continue;
          }

          const item = items!.find((i) => i.offer_id === offerId);

          if (!item) {
            if (offerId) {
              const found = await this.ozonApiClient.findProductByOfferId(offerId, product.storeId ?? undefined);
              if (found?.product_id) {
                product.ozonProductId = String(found.product_id);
                product.status = 'published';
                await this.ozonProductRepository.save(product);
                await this.booksService.updateFromExtraction(product.bookId, { status: BookStatus.PUBLISHED, publishedToOzon: new Date() });
              }
            }
          } else if (item.status === 'imported') {
            product.ozonProductId = String(item.product_id);
            product.status = 'published';
            await this.ozonProductRepository.save(product);
            await this.booksService.updateFromExtraction(product.bookId, { status: BookStatus.PUBLISHED, publishedToOzon: new Date() });
            this.logger.log(`Book ${product.bookId}: imported to Ozon, product_id=${item.product_id}`);
          } else if (item.status === 'failed') {
            const errorMsg = item.errors?.map((e) => e.message).join('; ') || 'Import failed';
            // Ozon sometimes reports 'failed' in the import task even when the product was created.
            // Verify by searching on Ozon before marking as failed.
            if (offerId) {
              try {
                const found = await this.ozonApiClient.findProductByOfferId(offerId, product.storeId ?? undefined);
                if (found?.product_id) {
                  product.ozonProductId = String(found.product_id);
                  product.status = 'published';
                  await this.ozonProductRepository.save(product);
                  await this.booksService.updateFromExtraction(product.bookId, { status: BookStatus.PUBLISHED, publishedToOzon: new Date() });
                  this.logger.log(`Book ${product.bookId}: task reported failed but product found on Ozon by offer_id=${offerId}, product_id=${found.product_id}`);
                  continue;
                }
              } catch { /* not found, fall through to mark as failed */ }
            }
            product.status = 'failed';
            product.errorMessage = errorMsg;
            await this.ozonProductRepository.save(product);
            await this.booksService.updateFromExtraction(product.bookId, { status: BookStatus.PUBLICATION_FAILED });
            this.logger.warn(`Book ${product.bookId}: import failed — ${errorMsg}`);
          }
        } catch (error) {
          this.logger.error(`Error processing book ${product.bookId} in task ${taskId}`, error);
        }
      }
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
    const books = await Promise.all(bookIds.map((id) => this.booksService.findOne(id)));

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
      if (book.isCopy && !book.publishedToOzon) {
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
      failed: failed.length,
      failedBooks: failed,
      message: `Отправлено на модерацию: ${succeeded.length} из ${bookIds.length}`,
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

  /**
   * Проходит по всем ozon_products со статусом 'failed' и offer_id в publishPayload.
   * Если товар найден на Ozon (по любому магазину) — помечает как published.
   */
  async repairFailedPublications(): Promise<{ checked: number; published: number; skipped: number }> {
    this.logger.log('repairFailedPublications: started');
    const failed = await this.ozonProductRepository
      .createQueryBuilder('op')
      .where('op.status = :status', { status: 'failed' })
      .getMany();
    this.logger.log(`repairFailedPublications: found ${failed.length} failed records`);

    const withOfferId = failed.filter(
      (op) => op.publishPayload?.items?.[0]?.offer_id,
    );

    if (!withOfferId.length) {
      return { checked: 0, published: 0, skipped: 0 };
    }

    let published = 0;
    let skipped = 0;

    const allStores = await this.ozonApiClient.getAllStores();

    for (const op of withOfferId) {
      const offerId = (op.publishPayload as any).items[0].offer_id as string;
      try {
        const found = await this.findProductByOfferIdWithFallback(offerId, op.storeId, allStores);
        if (found?.product_id) {
          op.ozonProductId = String(found.product_id);
          op.status = 'published';
          if (found.storeId) op.storeId = found.storeId;
          await this.ozonProductRepository.save(op);
          await this.booksService.updateFromExtraction(op.bookId, {
            status: BookStatus.PUBLISHED,
            publishedToOzon: new Date(),
          });
          published++;
          this.logger.log(`repairFailedPublications: book ${op.bookId} offer_id=${offerId} found on Ozon, product_id=${found.product_id}`);
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    this.logger.log(`repairFailedPublications: checked=${withOfferId.length}, published=${published}, skipped=${skipped}`);
    return { checked: withOfferId.length, published, skipped };
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


  private async findProductByOfferIdWithFallback(
    offerId: string,
    storeId: string | null,
    allStores: Array<{ id: string }>,
  ): Promise<{ product_id: number; storeId?: string } | null> {
    const storeIds = storeId
      ? [storeId, ...allStores.map((s) => s.id).filter((id) => id !== storeId)]
      : allStores.map((s) => s.id);

    for (const id of storeIds) {
      try {
        const found = await this.ozonApiClient.findProductByOfferId(offerId, id);
        if (found?.product_id) return { product_id: found.product_id, storeId: id };
      } catch { /* try next */ }
    }

    if (!storeIds.length) {
      try {
        const found = await this.ozonApiClient.findProductByOfferId(offerId);
        if (found?.product_id) return { product_id: found.product_id };
      } catch { /* not found */ }
    }

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

    for (const op of stuck) {
      const offerId = op.publishPayload?.items?.[0]?.offer_id as string | undefined;
      let resolved = false;

      if (offerId) {
        try {
          const found = await this.ozonApiClient.findProductByOfferId(offerId, op.storeId);
          if (found?.product_id) {
            op.ozonProductId = String(found.product_id);
            op.status = 'published';
            await this.ozonProductRepository.save(op);
            await this.booksService.updateFromExtraction(op.bookId, {
              status: BookStatus.PUBLISHED,
              publishedToOzon: new Date(),
            });
            published++;
            resolved = true;
          }
        } catch { /* не нашли */ }
      }

      if (!resolved) {
        op.status = 'failed';
        op.errorMessage = 'Publication task expired: product not found on Ozon. Please retry.';
        await this.ozonProductRepository.save(op);
        await this.booksService.updateFromExtraction(op.bookId, {
          status: BookStatus.PUBLICATION_FAILED,
        });
        failed++;
      }
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
