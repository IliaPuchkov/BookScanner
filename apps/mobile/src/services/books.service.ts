import api from './api';
import type { Book, CreateBookDto, UpdateBookDto, PaginatedResponse } from '../types';

interface GetBooksParams {
  page?: number;
  limit?: number;
  boxId?: string;
  search?: string;
  workSessionId?: string;
}

export const booksService = {
  async getBooks(params: GetBooksParams = {}): Promise<PaginatedResponse<Book>> {
    const { data } = await api.get<PaginatedResponse<Book>>('/books', { params });
    return data;
  },

  async getBook(id: string): Promise<Book> {
    const { data } = await api.get<Book>(`/books/${id}`);
    return data;
  },

  async createBook(dto: CreateBookDto): Promise<Book> {
    const { data } = await api.post<Book>('/books', dto);
    return data;
  },

  async createBookWithPhotos(
    dto: { title: string; boxId: string; workSessionId?: string },
    photoUris: string[],
  ): Promise<Book> {
    const formData = new FormData();
    formData.append('title', dto.title);
    formData.append('boxId', dto.boxId);
    if (dto.workSessionId) formData.append('workSessionId', dto.workSessionId);

    photoUris.forEach((uri, index) => {
      formData.append('files', {
        uri,
        name: `photo_${index}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
    });

    const { data } = await api.post<Book>('/books/create-with-photos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async updateBook(id: string, dto: UpdateBookDto): Promise<Book> {
    const { data } = await api.patch<Book>(`/books/${id}`, dto);
    return data;
  },

  async deleteBook(id: string): Promise<void> {
    await api.delete(`/books/${id}`);
  },

  async publishToOzon(bookId: string, storeId?: string): Promise<void> {
    await api.post('/ozon/publish', { bookId, storeId });
  },

  async publishBulkToOzon(
    bookIds: string[],
    storeId?: string,
  ): Promise<{ total: number; succeeded: number; failed: number; failedBooks: { id: string; title?: string; error: string }[] }> {
    const { data } = await api.post('/ozon/publish/bulk', { bookIds, storeId });
    return data;
  },

  async getBookCountsByBox(workSessionId: string): Promise<Array<{ boxId: string; boxNumber: string; count: number }>> {
    const { data } = await api.get('/books/counts-by-box', { params: { workSessionId } });
    return data;
  },

  async checkOzonStatus(bookId: string): Promise<{ status: string; message: string }> {
    const { data } = await api.post<{ status: string; message: string }>('/ozon/check-status', { bookId });
    return data;
  },
};
