import { Injectable, Logger, Inject } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { VISION_QUEUE, VISION_JOBS } from "./vision.constants";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { OcrResult } from "./entities/ocr-result.entity";
import { BooksService } from "../books/books.service";
import { PhotosService } from "../photos/photos.service";
import { SettingsService } from "../settings/settings.service";
import {
  IStorageProvider,
  STORAGE_PROVIDER,
} from "../photos/storage/storage.interface";
import {
  GeminiVisionExtractor,
  applyDefaults,
} from "@bookscanner/ocr-processor";
import {
  PaperType,
  CoverType,
  ANNOTATION_PREFIX,
  DEFAULT_PRICE,
  DEFAULT_LOWER_PRICE,
} from "@bookscanner/shared";

function normalizePaperType(
  value: string | undefined | null,
): PaperType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower.includes("глянц")) return PaperType.GLOSSY;
  if (lower.includes("матов")) return PaperType.MATTE;
  return PaperType.OFFSET; // офсетная — default
}

function normalizeCoverType(
  value: string | undefined | null,
): CoverType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower.includes("мягк")) return CoverType.SOFTCOVER;
  return CoverType.HARDCOVER; // твердый переплет — default
}

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
    @InjectQueue(VISION_QUEUE)
    private readonly extractionQueue: Queue,
  ) {}

  async queueBulkExtraction(bookIds: string[]): Promise<{ queued: number }> {
    const jobs = bookIds.map((bookId) => ({
      name: VISION_JOBS.EXTRACT_BOOK,
      data: { bookId },
      opts: { removeOnComplete: 100, removeOnFail: 200 },
    }));

    // Сбрасываем статус всех книг в 'pending' перед постановкой в очередь
    await this.ocrResultRepository
      .createQueryBuilder()
      .update()
      .set({ status: 'pending', errorMessage: null as any })
      .where('book_id IN (:...bookIds)', { bookIds })
      .execute();

    await this.extractionQueue.addBulk(jobs);
    return { queued: bookIds.length };
  }

  async extractBookData(bookId: string) {
    const book = await this.booksService.findOne(bookId);
    const photos = await this.photosService.findByBookId(bookId);

    let ocrResult = await this.ocrResultRepository.findOne({
      where: { bookId },
    });

    if (!ocrResult) {
      ocrResult = this.ocrResultRepository.create({
        bookId,
        status: "processing",
      });
    } else {
      ocrResult.status = "processing";
    }

    try {
      ocrResult = await this.ocrResultRepository.save(ocrResult);
      const apiKey = this.configService.get<string>("POLZA_AI_API_KEY");
      if (!apiKey) {
        throw new Error("POLZA_AI_API_KEY не настроен в переменных окружения");
      }

      const prompt = await this.settingsService.getValue<string>(
        "vision_ai_prompt",
        this.getDefaultPrompt(),
      );

      const extractor = new GeminiVisionExtractor(apiKey);

      const availablePhotos = photos.slice(0, 2).filter(Boolean);
      const imageBuffers = await Promise.all(
        availablePhotos.map(async (p) => ({
          buffer: await this.storage.download(p.fileKey),
          mimeType: p.mimeType as "image/jpeg" | "image/png",
        })),
      );

      const result = await extractor.extractBookData(imageBuffers, prompt);
      const extractedData = applyDefaults(result);

      ocrResult.photo01Extraction = (availablePhotos[0] ? result : null) as unknown as Record<string, unknown>;
      ocrResult.photo02Extraction = null as unknown as Record<string, unknown>;
      ocrResult.extractedData = extractedData as unknown as Record<
        string,
        unknown
      >;
      ocrResult.status = "completed";
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
        paperType: normalizePaperType(extractedData.paperType),
        coverType: normalizeCoverType(extractedData.coverType),
        pageCount: extractedData.pageCount,
        price: await this.calculatePrice(extractedData.price ?? undefined),
        annotation: extractedData.annotation
          ? `${ANNOTATION_PREFIX}${extractedData.annotation}`
          : ANNOTATION_PREFIX.trim(),
        language: extractedData.language,
        hashtags: extractedData.hashtags,
      });

      return {
        ocrResult,
        mergedData: extractedData,
        photosProcessed: photos.length,
      };
    } catch (error) {
      if (ocrResult.id) {
        ocrResult.status = "failed";
        ocrResult.errorMessage =
          error instanceof Error ? error.message : "Неизвестная ошибка";
        await this.ocrResultRepository.save(ocrResult).catch(() => {});
      }
      throw error;
    }
  }

  private async calculatePrice(
    aiPrice: number | undefined | null,
  ): Promise<number> {
    const [priceDefault, priceMin, discountThreshold, discountPercent, multiplier] =
      await Promise.all([
        this.settingsService.getValue<number>("price_default", DEFAULT_PRICE),
        this.settingsService.getValue<number>("price_min", DEFAULT_LOWER_PRICE),
        this.settingsService.getValue<number>("price_discount_threshold", 1200),
        this.settingsService.getValue<number>("price_discount_percent", 15),
        this.settingsService.getValue<number>("price_ai_multiplier", 9),
      ]);

    if (!aiPrice || aiPrice <= 0) return priceDefault;
    const adjusted = aiPrice * multiplier;
    if (adjusted < priceMin) return priceMin;
    if (adjusted > discountThreshold)
      return Math.round(adjusted * (1 - discountPercent / 100));
    return Math.round(adjusted);
  }

  async getOcrResult(bookId: string) {
    return this.ocrResultRepository.findOne({ where: { bookId } });
  }

  async isbnLookup(isbn: string) {
    this.logger.log(`ISBN lookup: ${isbn}`);
    return {
      isbn,
      found: false,
      message: "Поиск по ISBN будет реализован при интеграции с Ozon API",
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
- price (цена книги в рублях на Озоне (ozon.ru) или на аналогичных маркетплейсах - найди актуальную рыночную цену б/у экземпляра этой книги исходя из isbn, названия и автора; верни число без валюты)
- hashtags (массив хэштегов для маркетплейса Озон. Правила:
  - язык: русский
  - каждый хэштег начинается с # и содержит только буквы и цифры
  - если из 2+ слов — соединить нижним подчеркиванием _
  - длина каждого не более 30 символов
  - НЕ добавлять бренды, параметры или название товара
  - сгенерируй как можно больше релевантных хэштегов (до 30)
  - включи: жанр, тематику, эпоху, настроение, аудиторию, ключевые темы книги, литературное направление, похожие авторы/жанры
  - примеры: #классика, #русская_литература, #проза, #детектив, #советская_книга)

Если не найдешь название выполни поиск названия по isbn.

Если какое-то поле не удается определить, верни null для этого поля.`;
  }
}
