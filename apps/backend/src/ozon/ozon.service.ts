import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OzonProduct } from './entities/ozon-product.entity';
import { BooksService } from '../books/books.service';
import { OzonApiClient, OzonApiError } from './ozon-api.client';
import { buildOzonImportPayload } from './ozon-payload.builder';
import { BookStatus, OZON_ATTR_BRAND, OZON_ATTR_AUTHOR } from '@bookscanner/shared';

const IMPORTABLE_STATUSES = ['importing', 'moderation_pending'];

@Injectable()
export class OzonService {
  private readonly logger = new Logger(OzonService.name);

  constructor(
    @InjectRepository(OzonProduct)
    private readonly ozonProductRepository: Repository<OzonProduct>,
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

    const [brandDictValueId, authorDictValueId] = await Promise.all([
      this.ozonApiClient.findDictionaryValue(
        OZON_ATTR_BRAND,
        book.publisher || 'Нет бренда',
      ),
      this.ozonApiClient.findDictionaryValue(
        OZON_ATTR_AUTHOR,
        book.author || 'Не указан',
      ),
    ]);

    this.logger.log(
      `Dictionary lookup: brand="${book.publisher}" → ${brandDictValueId}, author="${book.author}" → ${authorDictValueId}`,
    );

    const payload = buildOzonImportPayload(book, { brandDictValueId, authorDictValueId });

    // Create or update OzonProduct entry
    let ozonProduct = await this.ozonProductRepository.findOne({
      where: { bookId },
    });

    if (!ozonProduct) {
      ozonProduct = this.ozonProductRepository.create({ bookId });
    }

    ozonProduct.publishPayload = payload;
    ozonProduct.status = 'importing';

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
          return { status: ozonProduct.status, message: 'Импорт в процессе' };
        }

        if (item.status === 'imported') {
          ozonProduct.ozonProductId = String(item.product_id);
          ozonProduct.status = 'moderation_pending';
          await this.ozonProductRepository.save(ozonProduct);
          this.logger.log(`Book ${bookId}: imported, product_id=${item.product_id}`);
        } else if (item.status === 'failed') {
          const errorMsg = item.errors?.map((e) => e.message).join('; ') || 'Import failed';
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
        this.logger.error(`Error checking import for book ${bookId}`, error);
        return { status: ozonProduct.status, message: 'Ошибка проверки статуса импорта' };
      }
    }

    // Phase 2: Check moderation status
    if (ozonProduct.status === 'moderation_pending' && ozonProduct.ozonProductId) {
      try {
        const productInfo = await this.ozonApiClient.getProductInfo(
          Number(ozonProduct.ozonProductId),
        );

        const moderateStatus = productInfo.status?.moderate_status;
        const state = productInfo.status?.state;

        if (moderateStatus === 'approved' || state === 'processed') {
          ozonProduct.status = 'published';
          await this.ozonProductRepository.save(ozonProduct);

          await this.booksService.updateFromExtraction(bookId, {
            status: BookStatus.PUBLISHED,
            publishedToOzon: new Date(),
          });

          this.logger.log(`Book ${bookId}: published on Ozon`);
          return { status: 'published', message: 'Опубликовано на Ozon' };
        }

        if (moderateStatus === 'declined' || productInfo.status?.is_failed) {
          const reason = productInfo.status?.state_description || 'Модерация отклонена';
          ozonProduct.status = 'failed';
          ozonProduct.errorMessage = reason;
          await this.ozonProductRepository.save(ozonProduct);

          await this.booksService.updateFromExtraction(bookId, {
            status: BookStatus.PUBLICATION_FAILED,
          });

          this.logger.warn(`Book ${bookId}: moderation declined — ${reason}`);
          return { status: 'failed', message: reason };
        }

        return { status: 'moderation_pending', message: 'На модерации Ozon' };
      } catch (error) {
        this.logger.error(`Error checking moderation for book ${bookId}`, error);
        return { status: ozonProduct.status, message: 'Ошибка проверки статуса модерации' };
      }
    }

    return { status: ozonProduct.status, message: this.getStatusMessage(ozonProduct.status) };
  }

  async checkAllPendingStatuses(): Promise<void> {
    const pending = await this.ozonProductRepository.find({
      where: { status: In(IMPORTABLE_STATUSES) },
    });

    this.logger.log(`Checking ${pending.length} pending Ozon products`);

    for (const product of pending) {
      try {
        await this.checkStatus(product.bookId);
      } catch (error) {
        this.logger.error(
          `Error checking status for book ${product.bookId}`,
          error,
        );
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

    // 4. Dictionary lookups for unique publishers/authors (results are cached in OzonApiClient)
    const validForLookup = books.filter((b) => b.title && b.photos?.length >= 2);
    const uniquePublishers = [...new Set(validForLookup.map((b) => b.publisher || 'Нет бренда'))];
    const uniqueAuthors = [...new Set(validForLookup.map((b) => b.author || 'Не указан'))];

    const [brandEntries, authorEntries] = await Promise.all([
      Promise.all(
        uniquePublishers.map(async (p) => [p, await this.ozonApiClient.findDictionaryValue(OZON_ATTR_BRAND, p)] as const),
      ),
      Promise.all(
        uniqueAuthors.map(async (a) => [a, await this.ozonApiClient.findDictionaryValue(OZON_ATTR_AUTHOR, a)] as const),
      ),
    ]);
    const brandLookup = Object.fromEntries(brandEntries);
    const authorLookup = Object.fromEntries(authorEntries);

    // 5. Split into valid and skipped
    type BatchEntry = { book: (typeof books)[0]; payload: Record<string, unknown>; item: unknown };
    const validEntries: BatchEntry[] = [];
    const failed: { id: string; title?: string; error: string }[] = [];

    for (const book of books) {
      if (!book.title) {
        failed.push({ id: book.id, title: book.title, error: 'Не заполнено название' });
        continue;
      }
      if (!book.photos || book.photos.length < 2) {
        failed.push({ id: book.id, title: book.title, error: 'Необходимо минимум 2 фото' });
        continue;
      }
      const payload = buildOzonImportPayload(book, {
        brandDictValueId: brandLookup[book.publisher || 'Нет бренда'],
        authorDictValueId: authorLookup[book.author || 'Не указан'],
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

  async priceLookup(query: string) {
    this.logger.log(`Price lookup: ${query}`);
    return {
      query,
      averagePrice: 0,
      results: [],
      message: 'Поиск цен будет реализован при интеграции с Ozon API',
    };
  }

  private getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      draft: 'Черновик',
      importing: 'Импортируется на Ozon',
      moderation_pending: 'На модерации Ozon',
      published: 'Опубликовано на Ozon',
      failed: 'Ошибка публикации',
    };
    return messages[status] || status;
  }
}
