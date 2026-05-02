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
  type IExtractionResult,
} from "@bookscanner/shared";
import { Book } from "../books/entities/book.entity";

function normalizePaperType(
  value: string | undefined | null,
): PaperType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower.includes("глянц")) return PaperType.GLOSSY;
  if (lower.includes("матов")) return PaperType.MATTE;
  return PaperType.OFFSET;
}

function normalizeCoverType(
  value: string | undefined | null,
): CoverType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower.includes("мягк")) return CoverType.SOFTCOVER;
  return CoverType.HARDCOVER;
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

  private readonly JOB_OPTS = {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 3000 },
  };

  // ─── Queue ────────────────────────────────────────────────────────────────

  async queueExtraction(bookId: string): Promise<{ queued: number }> {
    let ocrResult = await this.ocrResultRepository.findOne({ where: { bookId } });
    if (!ocrResult) {
      ocrResult = this.ocrResultRepository.create({ bookId, status: "pending" });
    } else {
      ocrResult.status = "pending";
      ocrResult.errorMessage = null as any;
    }
    await this.ocrResultRepository.save(ocrResult);
    await this.extractionQueue.add(VISION_JOBS.EXTRACT_BOOK, { bookId }, this.JOB_OPTS);
    this.logger.log(`[${bookId}] queued for extraction`);
    return { queued: 1 };
  }

  async queueBulkExtraction(bookIds: string[]): Promise<{ queued: number }> {
    const jobs = bookIds.map((bookId) => ({
      name: VISION_JOBS.EXTRACT_BOOK,
      data: { bookId },
      opts: this.JOB_OPTS,
    }));
    await this.ocrResultRepository
      .createQueryBuilder()
      .update()
      .set({ status: "pending", errorMessage: null as any })
      .where("book_id IN (:...bookIds)", { bookIds })
      .execute();
    await this.extractionQueue.addBulk(jobs);
    this.logger.log(`bulk queued ${bookIds.length} books`);
    return { queued: bookIds.length };
  }

  // ─── BullMQ job ───────────────────────────────────────────────────────────

  async extractBookData(bookId: string) {
    this.logger.log(`[${bookId}] ── extractBookData START (BullMQ job)`);

    const photos = await this.photosService.findByBookId(bookId);
    this.logger.log(`[${bookId}] photos in DB: ${photos.length}`);

    let ocrResult = await this.ocrResultRepository.findOne({ where: { bookId } });
    if (!ocrResult) {
      ocrResult = this.ocrResultRepository.create({ bookId, status: "processing" });
    } else {
      ocrResult.status = "processing";
    }

    try {
      ocrResult = await this.ocrResultRepository.save(ocrResult);

      const { extractor, imageUrls, availablePhotos, prompt } =
        await this.prepareExtractor(bookId, photos);

      const { result, extractedData } = await this.runAiWithRetry(
        bookId,
        extractor,
        imageUrls,
        prompt,
      );

      const calculatedPrice = await this.calculatePrice(extractedData.price ?? undefined);
      const updatePayload = this.buildUpdatePayload(extractedData, calculatedPrice);

      this.logger.log(`[${bookId}] calling updateFromExtraction`);
      await this.booksService.updateFromExtraction(bookId, updatePayload);

      ocrResult.photo01Extraction = (availablePhotos[0] ? result : null) as unknown as Record<string, unknown>;
      ocrResult.photo02Extraction = null as unknown as Record<string, unknown>;
      ocrResult.extractedData = extractedData as unknown as Record<string, unknown>;
      ocrResult.status = "completed";
      await this.ocrResultRepository.save(ocrResult);

      this.logger.log(`[${bookId}] ── extractBookData DONE`);
      return { ocrResult, mergedData: extractedData, photosProcessed: photos.length };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${bookId}] ── extractBookData FAILED: ${msg}`);
      if (ocrResult.id) {
        ocrResult.status = "failed";
        ocrResult.errorMessage = msg;
        await this.ocrResultRepository.save(ocrResult).catch((e) =>
          this.logger.error(`[${bookId}] could not save failed status: ${e?.message}`),
        );
      }
      throw error;
    }
  }

  // ─── Preview (synchronous, admin screen) ─────────────────────────────────

  async extractBookDataPreview(bookId: string): Promise<{
    extractedData: Record<string, unknown>;
    calculatedPrice: number;
  }> {
    this.logger.log(`[${bookId}] ── extractBookDataPreview START`);

    const photos = await this.photosService.findByBookId(bookId);
    this.logger.log(`[${bookId}] photos in DB: ${photos.length}`);

    let ocrResult = await this.ocrResultRepository.findOne({ where: { bookId } });
    if (!ocrResult) {
      ocrResult = this.ocrResultRepository.create({ bookId, status: "processing" });
    } else {
      ocrResult.status = "processing";
    }

    try {
      ocrResult = await this.ocrResultRepository.save(ocrResult);

      const { extractor, imageUrls, availablePhotos, prompt } =
        await this.prepareExtractor(bookId, photos);

      const { result, extractedData } = await this.runAiWithRetry(
        bookId,
        extractor,
        imageUrls,
        prompt,
      );

      const calculatedPrice = await this.calculatePrice(extractedData.price ?? undefined);
      const updatePayload = this.buildUpdatePayload(extractedData, calculatedPrice);

      this.logger.log(`[${bookId}] calling updateFromExtraction (preview)`);
      await this.booksService.updateFromExtraction(bookId, updatePayload);

      ocrResult.photo01Extraction = (availablePhotos[0] ? result : null) as unknown as Record<string, unknown>;
      ocrResult.photo02Extraction = null as unknown as Record<string, unknown>;
      ocrResult.extractedData = extractedData as unknown as Record<string, unknown>;
      ocrResult.status = "completed";
      await this.ocrResultRepository.save(ocrResult);

      this.logger.log(`[${bookId}] ── extractBookDataPreview DONE`);
      return { extractedData: extractedData as unknown as Record<string, unknown>, calculatedPrice };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${bookId}] ── extractBookDataPreview FAILED: ${msg}`);
      if (ocrResult.id) {
        ocrResult.status = "failed";
        ocrResult.errorMessage = msg;
        await this.ocrResultRepository.save(ocrResult).catch((e) =>
          this.logger.error(`[${bookId}] could not save failed status: ${e?.message}`),
        );
      }
      throw error;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async prepareExtractor(bookId: string, photos: any[]) {
    const apiKey = this.configService.get<string>("POLZA_AI_API_KEY");
    if (!apiKey) throw new Error("POLZA_AI_API_KEY не настроен");

    const prompt = await this.settingsService.getValue<string>(
      "vision_ai_prompt",
      this.getDefaultPrompt(),
    );

    const extractor = new GeminiVisionExtractor(apiKey);
    const availablePhotos = photos.slice(0, 4).filter(Boolean);
    const imageUrls = await Promise.all(
      availablePhotos.map((p) => this.storage.getSignedUrl(p.fileKey, 3600)),
    );

    this.logger.log(`[${bookId}] sending ${imageUrls.length} image(s) to AI`);
    if (imageUrls.length === 0) {
      this.logger.warn(`[${bookId}] no images available — AI will get no visual input`);
    }

    return { extractor, imageUrls, availablePhotos, prompt };
  }

  /**
   * AI sometimes wraps its response in an array-like object: {"0": {...data...}}
   * instead of returning a flat IExtractionResult. This flattens such responses.
   */
  private normalizeAiResult(raw: Record<string, unknown>): IExtractionResult {
    // Detect array-wrapping: {"0": {...}, "1": {...}} — merge all numeric buckets
    const numericKeys = Object.keys(raw).filter((k) => /^\d+$/.test(k));
    if (numericKeys.length > 0 && !raw.title && !raw.author && !raw.isbn) {
      this.logger.warn(
        `AI returned array-wrapped response with keys [${numericKeys.join(', ')}] — flattening`,
      );
      const merged: Record<string, unknown> = {};
      for (const k of numericKeys) {
        const bucket = raw[k];
        if (bucket && typeof bucket === 'object') {
          Object.assign(merged, bucket);
        }
      }
      return merged as IExtractionResult;
    }
    return raw as IExtractionResult;
  }

  private async runAiWithRetry(
    bookId: string,
    extractor: GeminiVisionExtractor,
    imageUrls: string[],
    prompt: string,
  ): Promise<{ result: IExtractionResult; extractedData: IExtractionResult }> {
    let result: IExtractionResult | undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.logger.log(`[${bookId}] AI attempt ${attempt}/3…`);
        const raw = await extractor.extractBookData(
          imageUrls.map((url) => ({ url })),
          prompt,
        );
        result = this.normalizeAiResult(raw as unknown as Record<string, unknown>);
        this.logger.log(
          `[${bookId}] AI attempt ${attempt} result: ` +
          `title=${JSON.stringify(result.title)}, ` +
          `author=${JSON.stringify(result.author)}, ` +
          `isbn=${JSON.stringify(result.isbn)}, ` +
          `price=${result.price}`,
        );
        if (result.title || result.author || result.isbn) {
          this.logger.log(`[${bookId}] AI returned key fields on attempt ${attempt}`);
          break;
        }
        if (attempt < 3) {
          this.logger.warn(`[${bookId}] attempt ${attempt}: no key fields, retrying in ${3 * attempt}s`);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        } else {
          this.logger.warn(`[${bookId}] all 3 attempts returned no key fields — proceeding with defaults`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[${bookId}] AI attempt ${attempt} threw: ${msg}`);
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }

    const extractedData = applyDefaults(result!);
    this.logger.log(
      `[${bookId}] after applyDefaults: ` +
      `title=${JSON.stringify(extractedData.title)}, ` +
      `author=${JSON.stringify(extractedData.author)}, ` +
      `weightGross=${extractedData.weightGross}, ` +
      `paperType=${extractedData.paperType}`,
    );

    return { result: result!, extractedData };
  }

  private buildUpdatePayload(
    extractedData: IExtractionResult,
    calculatedPrice: number,
  ): Partial<Book> {
    return {
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
      printRun: extractedData.printRun,
      price: calculatedPrice,
      annotation: extractedData.annotation
        ? `${ANNOTATION_PREFIX}${extractedData.annotation}`
        : ANNOTATION_PREFIX.trim(),
      language: extractedData.language,
      hashtags: extractedData.hashtags,
    };
  }

  private async calculatePrice(aiPrice: number | undefined | null): Promise<number> {
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

  // ─── Other ────────────────────────────────────────────────────────────────

  async getOcrResult(bookId: string) {
    return this.ocrResultRepository.findOne({ where: { bookId } });
  }

  async isbnLookup(isbn: string) {
    return { isbn, found: false, message: "ISBN-поиск будет реализован позже" };
  }

  private getDefaultPrompt(): string {
    return `Извлеки из фотографии книги следующую информацию в формате JSON:

- title (название книги)
- author (автор книги)
- isbn (Если их два и более, то выбери один наиболее подходящий)
- publisher (издательство)
- yearPublished (год издания)
- width (ширина в мм)
- height (высота в мм)
- depth (толщина в мм)
- weightGross (вес в граммах)
- paperType (тип бумаги)
- coverType (тип обложки)
- pageCount (количество страниц)
- printRun (тираж книги — число экземпляров, обычно указано на странице с выходными данными)
- annotation (аннотация книги - НЕ БОЛЕЕ 500 СИМВОЛОВ)
- price (выполни поиск по title на Ozon.ru, найди цену; верни число без валюты. Если цену не удается найти, то оцени книгу сам исходя из похожих книг. Укажи цену в рублях, только число без валюты и запятых)
- hashtags (массив хэштегов для маркетплейса Озон. Правила:
    - язык: русский
    - каждый хэштег начинается с # и содержит только буквы и цифры
    - если хэштег состоит из 2+ слов — соединить  слова нижним подчеркиванием _
    - длина каждого хэштега должна быть не более 29 символов!!!!
    - НЕ добавлять бренды, параметры или название товара, никаких рекламных выражений или названий маркетинговых акций
    - НИКАКОГО упоминания политики, военных действий или запрещенных веществ
    - сгенерируй как можно больше релевантных хэштегов (до 30)
    - включи: жанр, тематику, эпоху, настроение, аудиторию, ключевые темы книги, литературное направление, похожие авторы/жанры
    - примеры: #классика, #русская_литература, #проза, #детектив, #советская_книга, #приключения)

Если не найдешь какую-то информацию, то выполни поиск книги по isbn.

Если какое-то поле не удается определить, верни null для этого поля.`;
  }
}
