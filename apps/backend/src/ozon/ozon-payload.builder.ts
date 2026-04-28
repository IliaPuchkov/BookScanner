import { Book } from "../books/entities/book.entity";
import {
  OZON_DESCRIPTION_CATEGORY_ID,
  OZON_TYPE_ID,
  OZON_ATTR_NAME,
  OZON_ATTR_AUTHOR_COVER,
  OZON_ATTR_BRAND,
  OZON_ATTR_TYPE,
  OZON_ATTR_DIRECTION,
  OZON_ATTR_AUTHOR,
  OZON_ATTR_ISBN,
  OZON_ATTR_PUBLISHER,
  OZON_ATTR_YEAR,
  OZON_ATTR_COVER_TYPE,
  OZON_ATTR_PAPER_TYPE,
  OZON_ATTR_PAGE_COUNT,
  OZON_ATTR_LANGUAGE,
  OZON_ATTR_CONDITION,
  OZON_ATTR_ANNOTATION,
  OZON_ATTR_BOOK_TYPE,
  OZON_ATTR_DIMENSIONS,
  OZON_ATTR_WEIGHT,
  OZON_ATTR_HASHTAGS,
  DEFAULT_WEIGHT_G,
  DEFAULT_BOOK_TYPE,
  DEFAULT_DIRECTION,
} from "@bookscanner/shared";
import { formatDimensions } from "@bookscanner/shared";

interface OzonAttribute {
  complex_id: number;
  id: number;
  values: Array<{ dictionary_value_id?: number; value: string }>;
}

function attr(
  id: number,
  value: string | number,
  dictValueId?: number,
): OzonAttribute {
  const val: { value: string; dictionary_value_id?: number } = {
    value: String(value),
  };
  if (dictValueId) val.dictionary_value_id = dictValueId;
  return { complex_id: 0, id, values: [val] };
}

function multiAttr(
  id: number,
  values: Array<{ value: string; dictValueId?: number }>,
): OzonAttribute {
  return {
    complex_id: 0,
    id,
    values: values.map(({ value, dictValueId }) => {
      const v: { value: string; dictionary_value_id?: number } = { value };
      if (dictValueId) v.dictionary_value_id = dictValueId;
      return v;
    }),
  };
}

const FORBIDDEN_HASHTAG_PATTERNS = [
  /полити/i, /выбор/i, /война/i, /нарко/i, /оруж/i, /терро/i, /экстрем/i,
];

function sanitizeHashtags(tags: string[]): string[] {
  return tags
    .filter((t) => t.length <= 30)
    .filter((t) => !FORBIDDEN_HASHTAG_PATTERNS.some((p) => p.test(t)));
}

const COVER_TYPE_MAP: Record<string, string> = {
  "мягкий переплет": "Мягкая обложка",
  "твердый переплет": "Твердый переплет",
};

const PAPER_TYPE_MAP: Record<string, string> = {
  "офсетная": "Офсетная",
  "глянцевая": "Мелованная глянцевая",
  "матовая": "Мелованная матовая",
};

// Defaults when AI returns 0: длина=100, ширина=100, толщина=35
const DEFAULT_WIDTH_MM = 100; // ширина
const DEFAULT_LENGTH_MM = 100; // длина (= height в модели книги)
const DEFAULT_THICKNESS_MM = 35; // толщина (= depth в модели книги)

export interface ResolvedOzonData {
  brandDictValueId?: number;
  resolvedBrandName?: string;
  publisherDictValueId?: number;
  resolvedPublisherName?: string;
  authors?: Array<{ value: string; dictValueId?: number }>;
}

export function buildOzonImportPayload(
  book: Book,
  resolved: ResolvedOzonData = {},
): Record<string, unknown> {
  const raw = book.dimensions || { width: 0, height: 0, depth: 0 };
  const dimensions = {
    width: Math.round(raw.width || DEFAULT_WIDTH_MM), // ширина
    height: Math.round(raw.height || DEFAULT_LENGTH_MM), // длина
    depth: Math.round(raw.depth || DEFAULT_THICKNESS_MM), // толщина
  };
  const annotation = book.annotation || "";

  // Author cover: all authors joined by ";" without spaces
  const authorCoverText = resolved.authors?.length
    ? resolved.authors.map((a) => a.value).join(";")
    : book.author || "Не указан";

  const attributes: OzonAttribute[] = [
    // Required
    attr(OZON_ATTR_NAME, book.title),
    attr(OZON_ATTR_AUTHOR_COVER, authorCoverText),
    attr(OZON_ATTR_BRAND, resolved.resolvedBrandName ?? "Нет бренда", resolved.brandDictValueId),
    attr(OZON_ATTR_TYPE, book.bookType || DEFAULT_BOOK_TYPE),
    attr(OZON_ATTR_DIRECTION, book.direction || DEFAULT_DIRECTION),
  ];

  // OZON_ATTR_AUTHOR — строгий словарный атрибут, отправляем только авторов с найденным dict value id
  const foundAuthors = resolved.authors?.filter((a) => a.dictValueId);
  if (foundAuthors?.length) {
    attributes.push(multiAttr(OZON_ATTR_AUTHOR, foundAuthors));
  }

  // Optional attributes

  if (book.isbn) {
    attributes.push(attr(OZON_ATTR_ISBN, book.isbn));
  }
  if (resolved.resolvedPublisherName && resolved.publisherDictValueId) {
    attributes.push(attr(OZON_ATTR_PUBLISHER, resolved.resolvedPublisherName, resolved.publisherDictValueId));
  }
  if (book.yearPublished) {
    attributes.push(attr(OZON_ATTR_YEAR, book.yearPublished));
  }
  if (book.coverType) {
    attributes.push(attr(OZON_ATTR_COVER_TYPE, COVER_TYPE_MAP[book.coverType] ?? book.coverType));
  }
  if (book.paperType) {
    attributes.push(attr(OZON_ATTR_PAPER_TYPE, PAPER_TYPE_MAP[book.paperType] ?? book.paperType));
  }
  if (book.pageCount) {
    attributes.push(attr(OZON_ATTR_PAGE_COUNT, book.pageCount));
  }
  if (book.language) {
    attributes.push(attr(OZON_ATTR_LANGUAGE, book.language));
  }
  if (book.condition) {
    attributes.push(attr(OZON_ATTR_CONDITION, book.condition));
  }
  attributes.push(attr(OZON_ATTR_ANNOTATION, annotation));
  attributes.push(
    attr(OZON_ATTR_BOOK_TYPE, book.bookType || DEFAULT_BOOK_TYPE),
  );

  // Ozon format: ДxШxВ (длина x ширина x высота)
  // длина = height книги, ширина = width книги, высота = depth книги
  const dimStr = formatDimensions(
    dimensions.height,
    dimensions.width,
    dimensions.depth,
  );
  attributes.push(attr(OZON_ATTR_DIMENSIONS, dimStr));

  const weight = Math.round(book.weightGross || DEFAULT_WEIGHT_G);
  attributes.push(attr(OZON_ATTR_WEIGHT, weight));

  if (book.hashtags && book.hashtags.length > 0) {
    const cleanTags = sanitizeHashtags(book.hashtags);
    if (cleanTags.length > 0) {
      attributes.push(multiAttr(OZON_ATTR_HASHTAGS, cleanTags.map((t) => ({ value: t }))));
    }
  }

  const images =
    book.photos
      ?.sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => p.fileUrl) || [];

  return {
    items: [
      {
        description_category_id: OZON_DESCRIPTION_CATEGORY_ID,
        type_id: OZON_TYPE_ID,
        name: book.title,
        offer_id: book.sku,
        price: String(book.price || 0),
        // old_price: String(Math.round((book.price || 0) * 1.2)),
        vat: "0",
        weight: Number(weight),
        weight_unit: "g",
        width: dimensions.width, // высота книги → ширина Озон
        height: dimensions.depth, // ширина книги → длина Озон
        depth: dimensions.height,
        dimension_unit: "mm",
        images,
        attributes,
      },
    ],
  };
}
