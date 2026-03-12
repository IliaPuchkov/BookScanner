import { IExtractionResult } from '@bookscanner/shared';
import {
  DEFAULT_HEIGHT_MM,
  DEFAULT_WEIGHT_G,
  DEFAULT_PAPER_TYPE,
  DEFAULT_COVER_TYPE,
  DEFAULT_LANGUAGE,
} from '@bookscanner/shared';

/**
 * Merge extraction results from photo01 (cover) and photo02 (info page).
 * Photo02 takes priority; photo01 is used as fallback for title/author.
 */
export function mergeExtractionResults(
  photo01Result: Partial<IExtractionResult> | null,
  photo02Result: Partial<IExtractionResult> | null,
): IExtractionResult {
  const result: IExtractionResult = {};

  const p1 = photo01Result || {};
  const p2 = photo02Result || {};

  // Photo02 primary, Photo01 fallback
  result.title = p2.title || p1.title;
  result.author = p2.author || p1.author;
  result.isbn = p2.isbn;
  result.publisher = p2.publisher;
  result.yearPublished = p2.yearPublished;
  result.pageCount = p2.pageCount;
  result.annotation = p2.annotation;
  result.paperType = p2.paperType;
  result.coverType = p2.coverType;

  // Dimensions: photo01 (from ruler) primary, photo02 fallback
  result.width = p1.width || p2.width;
  result.height = p1.height || p2.height;
  result.depth = p1.depth || p2.depth;

  // Weight from photo02
  result.weightGross = p2.weightGross;
  result.weightNet = p2.weightNet;

  return result;
}

/**
 * Apply default values for missing fields.
 */
export function applyDefaults(data: IExtractionResult): IExtractionResult {
  return {
    ...data,
    height: data.height || DEFAULT_HEIGHT_MM,
    weightGross: data.weightGross || DEFAULT_WEIGHT_G,
    paperType: data.paperType || DEFAULT_PAPER_TYPE,
    coverType: data.coverType || DEFAULT_COVER_TYPE,
    language: data.language || DEFAULT_LANGUAGE,
  };
}
