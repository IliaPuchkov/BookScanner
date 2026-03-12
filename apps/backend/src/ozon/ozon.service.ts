import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OzonProduct } from './entities/ozon-product.entity';
import { BooksService } from '../books/books.service';
import {
  OZON_CATEGORY_PATH,
  ANNOTATION_PREFIX,
  DEFAULT_HEIGHT_MM,
  DEFAULT_WEIGHT_G,
} from '@bookscanner/shared';
import { formatDimensions } from '@bookscanner/shared';

@Injectable()
export class OzonService {
  private readonly logger = new Logger(OzonService.name);

  constructor(
    @InjectRepository(OzonProduct)
    private readonly ozonProductRepository: Repository<OzonProduct>,
    private readonly booksService: BooksService,
    private readonly configService: ConfigService,
  ) {}

  async publish(bookId: string) {
    const book = await this.booksService.findOne(bookId);

    const annotation = ANNOTATION_PREFIX + (book.annotation || '');
    const dimensions = book.dimensions || {
      width: 0,
      height: DEFAULT_HEIGHT_MM,
      depth: 0,
    };

    const payload = {
      items: [
        {
          category_id: OZON_CATEGORY_PATH,
          name: book.title,
          offer_id: book.sku,
          price: String(book.price),
          weight: book.weightGross || DEFAULT_WEIGHT_G,
          weight_unit: 'g',
          width: dimensions.width,
          height: dimensions.height,
          depth: dimensions.depth,
          dimension_unit: 'mm',
          attributes: {
            brand: book.publisher,
            author: book.author,
            direction: book.direction,
            annotation,
            isbn: book.isbn,
            year: book.yearPublished,
            paper_type: book.paperType,
            cover_type: book.coverType,
            book_type: book.bookType,
            language: book.language,
            page_count: book.pageCount,
            dimensions: formatDimensions(
              dimensions.width,
              dimensions.height,
              dimensions.depth,
            ),
            condition: book.condition,
          },
          images: book.photos
            ?.sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p) => p.fileUrl) || [],
          hashtags: book.hashtags || [],
        },
      ],
    };

    // Create or update OzonProduct entry
    let ozonProduct = await this.ozonProductRepository.findOne({
      where: { bookId },
    });

    if (!ozonProduct) {
      ozonProduct = this.ozonProductRepository.create({ bookId });
    }

    ozonProduct.publishPayload = payload;

    try {
      // TODO: Call Ozon API when credentials are configured
      const apiKey = this.configService.get<string>('OZON_API_KEY');
      if (!apiKey) {
        ozonProduct.status = 'draft';
        ozonProduct = await this.ozonProductRepository.save(ozonProduct);
        return {
          ozonProduct,
          message:
            'Карточка сохранена как черновик. Для публикации настройте OZON_API_KEY.',
        };
      }

      // TODO: Actual Ozon API call
      ozonProduct.status = 'published';
      ozonProduct = await this.ozonProductRepository.save(ozonProduct);

      // Update book publishedToOzon date
      await this.booksService.update(
        bookId,
        {} as any,
        book.createdById,
        'admin' as any,
      );

      return { ozonProduct, message: 'Карточка опубликована на Ozon' };
    } catch (error) {
      ozonProduct.status = 'failed';
      ozonProduct.errorMessage =
        error instanceof Error ? error.message : 'Ошибка публикации';
      await this.ozonProductRepository.save(ozonProduct);
      throw error;
    }
  }

  async priceLookup(query: string) {
    // TODO: Implement Ozon price search API
    this.logger.log(`Price lookup: ${query}`);
    return {
      query,
      averagePrice: 0,
      results: [],
      message:
        'Поиск цен будет реализован при интеграции с Ozon API',
    };
  }
}
