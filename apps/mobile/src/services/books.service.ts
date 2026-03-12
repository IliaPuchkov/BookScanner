import api from './api';
import type { Book, CreateBookDto, UpdateBookDto, PaginatedResponse } from '../types';

interface GetBooksParams {
  page?: number;
  limit?: number;
  boxId?: string;
  search?: string;
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

  async updateBook(id: string, dto: UpdateBookDto): Promise<Book> {
    const { data } = await api.patch<Book>(`/books/${id}`, dto);
    return data;
  },

  async deleteBook(id: string): Promise<void> {
    await api.delete(`/books/${id}`);
  },
};
