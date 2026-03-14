import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OcrResult } from './entities/ocr-result.entity';
import { BooksService } from '../books/books.service';
import { PhotosService } from '../photos/photos.service';
import { SettingsService } from '../settings/settings.service';
import { IStorageProvider, STORAGE_PROVIDER } from '../photos/storage/storage.interface';
import { OpenAIVisionExtractor, mergeExtractionResults, applyDefaults } from '@bookscanner/ocr-processor';
import { PaperType, CoverType } from '@bookscanner/shared';

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
    @Inject(STORAGE_PROVIDER)
    private readonly storage: IStorageProvider,
  ) {}

  async extractBookData(bookId: string) {
    const book = await this.booksService.findOne(bookId);
    const photos = await this.photosService.findByBookId(bookId);

    let ocrResult = await this.ocrResultRepository.findOne({ where: { bookId } });

    if (!ocrResult) {
      ocrResult = this.ocrResultRepository.create({ bookId, status: 'processing' });
    } else {
      ocrResult.status = 'processing';
    }

    ocrResult = await this.ocrResultRepository.save(ocrResult);

    try {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY не настроен в переменных окружения');
      }

      const prompt = await this.settingsService.getValue<string>(
        'ocr_prompt',
        this.getDefaultPrompt(),
      );

      const extractor = new OpenAIVisionExtractor(apiKey);

      const photo01 = photos[0];
      const photo02 = photos[1];

      const [result01, result02] = await Promise.all([
        photo01
          ? extractor.extractBookData(
              await this.storage.download(photo01.fileKey),
              prompt,
              photo01.mimeType as 'image/jpeg' | 'image/png',
            )
          : null,
        photo02
          ? extractor.extractBookData(
              await this.storage.download(photo02.fileKey),
              prompt,
              photo02.mimeType as 'image/jpeg' | 'image/png',
            )
          : null,
      ]);

      const merged = mergeExtractionResults(result01, result02);
      const extractedData = applyDefaults(merged);

      ocrResult.photo01Extraction = result01 as unknown as Record<string, unknown>;
      ocrResult.photo02Extraction = result02 as unknown as Record<string, unknown>;
      ocrResult.extractedData = extractedData as unknown as Record<string, unknown>;
      ocrResult.status = 'completed';
      await this.ocrResultRepository.save(ocrResult);

      await this.booksService.updateFromExtraction(bookId, {
        title: extractedData.title,
        author: extractedData.author,
        isbn: extractedData.isbn,
        publisher: extractedData.publisher,
        yearPublished: extractedData.yearPublished,
        ...(extractedData.width != null && {
          dimensions: {
            width: extractedData.width,
            height: extractedData.height ?? 0,
            depth: extractedData.depth ?? 0,
          },
        }),
        weightGross: extractedData.weightGross,
        weightNet: extractedData.weightNet,
        paperType: extractedData.paperType as PaperType,
        coverType: extractedData.coverType as CoverType,
        pageCount: extractedData.pageCount,
        annotation: extractedData.annotation,
        language: extractedData.language,
      });

      return {
        ocrResult,
        mergedData: extractedData,
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
    this.logger.log(`ISBN lookup: ${isbn}`);
    return {
      isbn,
      found: false,
      message: 'Поиск по ISBN будет реализован при интеграции с Ozon API',
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
