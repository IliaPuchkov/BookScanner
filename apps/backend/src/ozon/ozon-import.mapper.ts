import { PaperType, CoverType } from '@bookscanner/shared';
import {
  OZON_ATTR_NAME,
  OZON_ATTR_AUTHOR_COVER,
  OZON_ATTR_BRAND,
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
  OZON_ATTR_HASHTAGS,
} from '@bookscanner/shared';
import type { OzonProductAttributes } from './ozon-api.client';

export interface OzonImportBookData {
  sku: string;
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  yearPublished?: number;
  pageCount?: number;
  language?: string;
  annotation?: string;
  hashtags?: string[];
  condition?: string;
  bookType?: string;
  direction?: string;
  coverType?: CoverType;
  paperType?: PaperType;
  weightGross?: number;
  dimensions?: { width: number; height: number; depth: number };
  imageUrls: string[];
  ozonProductId: string;
}

function attrValue(product: OzonProductAttributes, attrId: number): string | undefined {
  const attr = product.attributes.find((a) => a.id === attrId);
  return attr?.values?.[0]?.value || undefined;
}

function attrValues(product: OzonProductAttributes, attrId: number): string[] {
  const attr = product.attributes.find((a) => a.id === attrId);
  return attr?.values?.map((v) => v.value).filter(Boolean) ?? [];
}

function mapCoverType(value: string | undefined): CoverType | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v.includes('мягк') || v.includes('softcover')) return CoverType.SOFTCOVER;
  if (v.includes('твёрд') || v.includes('тверд') || v.includes('hardcover')) return CoverType.HARDCOVER;
  return undefined;
}

function mapPaperType(value: string | undefined): PaperType | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v.includes('офсет')) return PaperType.OFFSET;
  if (v.includes('глянц')) return PaperType.GLOSSY;
  if (v.includes('матов') || v.includes('мелован')) return PaperType.MATTE;
  return undefined;
}

export function mapOzonProductToBook(product: OzonProductAttributes): OzonImportBookData {
  const title =
    attrValue(product, OZON_ATTR_NAME) || product.name || 'Без названия';

  const author =
    attrValue(product, OZON_ATTR_AUTHOR) ||
    attrValue(product, OZON_ATTR_AUTHOR_COVER);

  const publisher =
    attrValue(product, OZON_ATTR_PUBLISHER) ||
    attrValue(product, OZON_ATTR_BRAND);

  const yearRaw = attrValue(product, OZON_ATTR_YEAR);
  const yearPublished = yearRaw ? parseInt(yearRaw, 10) || undefined : undefined;

  const pageRaw = attrValue(product, OZON_ATTR_PAGE_COUNT);
  const pageCount = pageRaw ? parseInt(pageRaw, 10) || undefined : undefined;

  const hashtagsRaw = attrValues(product, OZON_ATTR_HASHTAGS);
  const hashtags = hashtagsRaw.length > 0 ? hashtagsRaw : undefined;

  const annotation = attrValue(product, OZON_ATTR_ANNOTATION);
  const language = attrValue(product, OZON_ATTR_LANGUAGE);
  const condition = attrValue(product, OZON_ATTR_CONDITION);
  const bookType = attrValue(product, OZON_ATTR_BOOK_TYPE);
  const direction = attrValue(product, OZON_ATTR_DIRECTION);

  const coverType = mapCoverType(attrValue(product, OZON_ATTR_COVER_TYPE));
  const paperType = mapPaperType(attrValue(product, OZON_ATTR_PAPER_TYPE));

  const images = product.images?.length > 0 ? product.images : (product.primary_image ? [product.primary_image] : []);

  const weightGross = product.weight > 0 ? product.weight : undefined;

  const width = product.width > 0 ? product.width : 0;
  const height = product.height > 0 ? product.height : 0;
  const depth = product.depth > 0 ? product.depth : 0;
  const dimensions = (width > 0 || height > 0 || depth > 0)
    ? { width, height, depth }
    : undefined;

  return {
    sku: product.offer_id,
    title,
    author,
    isbn: attrValue(product, OZON_ATTR_ISBN),
    publisher,
    yearPublished,
    pageCount,
    language,
    annotation,
    hashtags,
    condition,
    bookType,
    direction,
    coverType,
    paperType,
    weightGross,
    dimensions,
    imageUrls: images,
    ozonProductId: String(product.id),
  };
}
