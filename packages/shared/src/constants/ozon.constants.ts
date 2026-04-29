export const OZON_CATEGORY_PATH = [
  "Книги",
  "Букинистические издания (1942–2010)",
  "Печатная книга",
] as const;

// Ozon Seller API numeric IDs (discovered via /v1/description-category/tree & /attribute)
export const OZON_DESCRIPTION_CATEGORY_ID = 200001485;
export const OZON_TYPE_ID = 971445087;

// Required attributes
export const OZON_ATTR_NAME = 4180;           // Название
export const OZON_ATTR_AUTHOR_COVER = 4182;   // Автор на обложке (required)
export const OZON_ATTR_BRAND = 85;            // Бренд (= издательство)
export const OZON_ATTR_TYPE = 8229;           // Тип (= "Печатная книга")
export const OZON_ATTR_DIRECTION = 23273;     // Направление

// Optional attributes
export const OZON_ATTR_AUTHOR = 105;          // Автор
export const OZON_ATTR_ISBN = 4184;           // ISBN
export const OZON_ATTR_PUBLISHER = 7;         // Издательство
export const OZON_ATTR_YEAR = 4081;           // Год выпуска
export const OZON_ATTR_COVER_TYPE = 9356;     // Тип обложки
export const OZON_ATTR_PAPER_TYPE = 10755;    // Тип бумаги в книге
export const OZON_ATTR_PAGE_COUNT = 4051;     // Количество страниц
export const OZON_ATTR_LANGUAGE = 4189;       // Язык издания
export const OZON_ATTR_CONDITION = 8857;      // Сохранность книги
export const OZON_ATTR_ANNOTATION = 4191;     // Аннотация
export const OZON_ATTR_BOOK_TYPE = 9236;      // Тип книги
export const OZON_ATTR_DIMENSIONS = 4382;     // Размеры, мм
export const OZON_ATTR_WEIGHT = 4383;         // Вес товара, г
export const OZON_ATTR_HASHTAGS = 23171;      // #Хештеги
export const OZON_ATTR_TNVED = 22232;         // ТН ВЭД коды ЕАЭС (required)
export const OZON_TNVED_BOOKS_VALUE_ID = 971398243; // 4901990000 - Прочие книги, брошюры...

export const ANNOTATION_PREFIX =
  "ВНИМАНИЕ! Книга не новая! Состояние - на фото.\n\nПри необходимости мы можем добавить больше фотографий для оценки состояния экземпляра.\n\n";

export const DEFAULT_HEIGHT_MM = 35;
export const DEFAULT_WEIGHT_G = 450;
export const DEFAULT_PAPER_TYPE = "Офсетная";
export const DEFAULT_COVER_TYPE = "Твердый переплет";
export const DEFAULT_LANGUAGE = "Русский";
export const DEFAULT_CONDITION = "Хорошая";
export const DEFAULT_BOOK_TYPE = "Печатная книга";
export const DEFAULT_DIRECTION = "Проза";
export const DEFAULT_PRICE = 20000;
export const DEFAULT_LOWER_PRICE = 1000;
