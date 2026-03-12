import { IExtractionResult } from '@bookscanner/shared';
import { isValidIsbn } from '@bookscanner/shared';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate extracted book data.
 */
export function validateExtractedData(data: IExtractionResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.title) {
    errors.push('Название книги не определено');
  }

  if (data.isbn && !isValidIsbn(data.isbn)) {
    warnings.push(`ISBN "${data.isbn}" имеет неверный формат`);
  }

  if (data.yearPublished) {
    const year = data.yearPublished;
    if (year < 1800 || year > new Date().getFullYear()) {
      warnings.push(`Год издания ${year} выглядит некорректно`);
    }
  }

  if (data.pageCount && data.pageCount <= 0) {
    warnings.push('Количество страниц должно быть положительным числом');
  }

  if (data.width && data.width > 1000) {
    warnings.push('Ширина книги кажется слишком большой (> 1000 мм)');
  }

  if (data.height && data.height > 1000) {
    warnings.push('Высота книги кажется слишком большой (> 1000 мм)');
  }

  if (data.weightGross && data.weightGross > 10000) {
    warnings.push('Вес книги кажется слишком большим (> 10 кг)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
