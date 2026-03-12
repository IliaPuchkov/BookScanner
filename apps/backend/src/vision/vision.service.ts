import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OcrResult } from './entities/ocr-result.entity';
import { BooksService } from '../books/books.service';
import { PhotosService } from '../photos/photos.service';
import { SettingsService } from '../settings/settings.service';
import {
  DEFAULT_HEIGHT_MM,
  DEFAULT_WEIGHT_G,
  DEFAULT_PAPER_TYPE,
  DEFAULT_COVER_TYPE,
} from '@bookscanner/shared';

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(
    @InjectRepository(OcrResult)
    private readonly ocrResultRepository: Repository<OcrResult>,
    private readonly booksService: BooksService,
    private readonly photosService: PhotosService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {}

  async extractBookData(bookId: string) {
    const book = await this.booksService.findOne(bookId);
    const photos = await this.photosService.findByBookId(bookId);

    // Create or update OCR result
    let ocrResult = await this.ocrResultRepository.findOne({
      where: { bookId },
    });

    if (!ocrResult) {
      ocrResult = this.ocrResultRepository.create({
        bookId,
        status: 'processing',
      });
    } else {
      ocrResult.status = 'processing';
    }

    ocrResult = await this.ocrResultRepository.save(ocrResult);

    try {
      // Get Claude API prompt from settings
      const prompt = await this.settingsService.getValue<string>(
        'ocr_prompt',
        this.getDefaultPrompt(),
      );

      // TODO: Implement actual Claude Vision API call
      // For now, return a placeholder that shows the structure
      const extractedData = {
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        publisher: book.publisher,
        yearPublished: book.yearPublished,
        paperType: DEFAULT_PAPER_TYPE,
        coverType: DEFAULT_COVER_TYPE,
        pageCount: book.pageCount,
        annotation: book.annotation,
      };

      ocrResult.extractedData = extractedData;
      ocrResult.status = 'completed';
      await this.ocrResultRepository.save(ocrResult);

      // Apply defaults for missing data
      const mergedData = this.applyDefaults(extractedData);

      return {
        ocrResult,
        mergedData,
        photosProcessed: photos.length,
      };
    } catch (error) {
      ocrResult.status = 'failed';
      ocrResult.errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      await this.ocrResultRepository.save(ocrResult);
      throw error;
    }
  }

  async isbnLookup(isbn: string) {
    // TODO: Implement Ozon ISBN lookup
    this.logger.log(`ISBN lookup: ${isbn}`);
    return {
      isbn,
      found: false,
      message: 'Поиск по ISBN будет реализован при интеграции с Ozon API',
    };
  }

  private applyDefaults(data: Record<string, unknown>) {
    return {
      ...data,
      height: data.height || DEFAULT_HEIGHT_MM,
      weightGross: data.weightGross || DEFAULT_WEIGHT_G,
      paperType: data.paperType || DEFAULT_PAPER_TYPE,
      coverType: data.coverType || DEFAULT_COVER_TYPE,
      language: data.language || 'русский',
      condition: 'Хорошая',
    };
  }

  private getDefaultPrompt(): string {
    return `Извлеки из фотографии книги следующую информацию в формате JSON:
- title (название)
- author (автор)
- isbn
- publisher (издательство)
- yearPublished (год издания)
- width (ширина в мм)
- height (высота в мм)
- depth (толщина в мм)
- weightGross (вес в граммах)
- paperType (тип бумаги)
- coverType (тип обложки)
- pageCount (количество страниц)
- annotation (аннотация)
Если какое-то поле не удается определить, верни null для этого поля.`;
  }
}
