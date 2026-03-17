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
import { BookStatus } from '@bookscanner/shared';

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

  async publish(bookId: string) {
    const book = await this.booksService.findOne(bookId);

    if (!this.ozonApiClient.isConfigured) {
      throw new BadRequestException(
        'Ozon API не настроен. Проверьте OZON_API_KEY и OZON_CLIENT_ID.',
      );
    }

    if (!book.title) {
      throw new BadRequestException('Не заполнено название книги.');
    }

    if (!book.photos || book.photos.length < 2) {
      throw new BadRequestException('Необходимо минимум 2 фото для публикации на Ozon.');
    }

    const payload = buildOzonImportPayload(book);

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
      const result = await this.ozonApiClient.importProduct(payload);
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
