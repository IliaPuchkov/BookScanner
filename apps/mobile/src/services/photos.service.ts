import api from './api';
import type { BookPhoto } from '../types';

export const photosService = {
  async uploadPhotos(bookId: string, uris: string[]): Promise<BookPhoto[]> {
    const formData = new FormData();
    uris.forEach((uri, index) => {
      formData.append('files', {
        uri,
        name: `photo_${index}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
    });

    const { data } = await api.post<BookPhoto[]>(
      `/books/${bookId}/photos`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  async replacePhoto(bookId: string, photoId: string, uri: string): Promise<BookPhoto> {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    const { data } = await api.patch<BookPhoto>(
      `/books/${bookId}/photos/${photoId}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  async deletePhoto(bookId: string, photoId: string): Promise<void> {
    await api.delete(`/books/${bookId}/photos/${photoId}`);
  },

  async reorderPhotos(bookId: string, photoIds: string[]): Promise<void> {
    await api.post(`/books/${bookId}/photos/reorder`, { photoIds });
  },
};
