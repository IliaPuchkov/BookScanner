import { Injectable, Logger, Inject } from "@nestjs/common";
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
  OpenAIVisionExtractor,
  mergeExtractionResults,
  applyDefaults,
} from "@bookscanner/ocr-processor";
import {
  PaperType,
  CoverType,
  ANNOTATION_PREFIX,
  DEFAULT_PRICE,
  DEFAULT_LOWER_PRICE,
} from "@bookscanner/shared";

function calculatePrice(aiPrice: number | undefined | null): number {
  if (!aiPrice || aiPrice <= 0) return DEFAULT_PRICE;
  if (aiPrice < DEFAULT_LOWER_PRICE) return DEFAULT_LOWER_PRICE;
  if (aiPrice > 1200) return Math.round(aiPrice * 0.85);
  return Math.round(aiPrice);
}

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
  ) {}

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
      const apiKey = this.configService.get<string>("OPENAI_API_KEY");
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY не настроен в переменных окружения");
      }

      const prompt = await this.settingsService.getValue<string>(
        "ocr_prompt",
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
              photo01.mimeType as "image/jpeg" | "image/png",
            )
          : null,
        photo02
          ? extractor.extractBookData(
              await this.storage.download(photo02.fileKey),
              prompt,
              photo02.mimeType as "image/jpeg" | "image/png",
            )
          : null,
      ]);

      const merged = mergeExtractionResults(result01, result02);
      const extractedData = applyDefaults(merged);

      ocrResult.photo01Extraction = result01 as unknown as Record<
        string,
        unknown
      >;
      ocrResult.photo02Extraction = result02 as unknown as Record<
        string,
        unknown
      >;
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
        price: calculatePrice(extractedData.price),
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
