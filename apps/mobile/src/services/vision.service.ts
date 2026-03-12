import api from './api';
import type { OcrResult } from '../types';

export const visionService = {
  async extract(bookId: string): Promise<OcrResult> {
    const { data } = await api.post<OcrResult>('/vision/extract', { bookId });
    return data;
  },

  async isbnLookup(isbn: string) {
    const { data } = await api.post('/vision/isbn-lookup', { isbn });
    return data;
  },
};
