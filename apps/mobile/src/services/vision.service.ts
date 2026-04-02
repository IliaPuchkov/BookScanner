import api from './api';
import type { OcrResult } from '../types';

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

  async isbnLookup(isbn: string) {
    const { data } = await api.post('/vision/isbn-lookup', { isbn });
    return data;
  },
};
