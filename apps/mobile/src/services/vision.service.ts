import api from './api';
import type { OcrResult } from '../types';

export interface ExtractPreviewResult {
  extractedData: {
    title?: string | null;
    author?: string | null;
    isbn?: string | null;
    publisher?: string | null;
    yearPublished?: number | null;
    width?: number | null;
    height?: number | null;
    depth?: number | null;
    weightGross?: number | null;
    paperType?: string | null;
    coverType?: string | null;
    pageCount?: number | null;
    printRun?: number | null;
    price?: number | null;
    annotation?: string | null;
    hashtags?: string[] | null;
  };
  calculatedPrice: number;
}

export const visionService = {
  async extract(bookId: string): Promise<OcrResult> {
    const { data } = await api.post<OcrResult>('/vision/extract', { bookId });
    return data;
  },

  async extractBulk(bookIds: string[]): Promise<{ queued: number }> {
    const { data } = await api.post<{ queued: number }>('/vision/extract-bulk', { bookIds });
    return data;
  },

  async getResult(bookId: string): Promise<OcrResult | null> {
    const { data } = await api.get<OcrResult | null>(`/vision/result/${bookId}`);
    return data;
  },

  async extractPreview(bookId: string): Promise<ExtractPreviewResult> {
    const { data } = await api.post<ExtractPreviewResult>(
      '/vision/extract-preview',
      { bookId },
      { timeout: 60_000 },
    );
    return data;
  },

  async isbnLookup(isbn: string) {
    const { data } = await api.post('/vision/isbn-lookup', { isbn });
    return data;
  },
};
