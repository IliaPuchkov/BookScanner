import api from './api';
import type { User, PaginatedResponse, StatsSummary, Book } from '../types';

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
  valueType: string;
  updatedAt: string;
}

export interface OzonStore {
  id: string;
  name: string;
  clientId: string;
  apiKeyMasked: string;
  isActive: boolean;
}

export interface OzonStoreLimits {
  daily_create: { limit: number; reset_at: string; usage: number };
  daily_update: { limit: number; reset_at: string; usage: number };
  total: { limit: number; usage: number };
}

interface UpsertSettingDto {
  key: string;
  value: string;
  description?: string;
  valueType?: string;
}

interface CreateUserDto {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  role?: string;
}

interface UpdateUserDto {
  fullName?: string;
  phone?: string;
  email?: string;
  role?: string;
  isApproved?: boolean;
}

export const adminService = {
  async getUsers(page = 1, limit = 20): Promise<PaginatedResponse<User>> {
    const { data } = await api.get<PaginatedResponse<User>>('/admin/users', {
      params: { page, limit },
    });
    return data;
  },

  async createUser(dto: CreateUserDto): Promise<User> {
    const { data } = await api.post<User>('/admin/users', dto);
    return data;
  },

  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const { data } = await api.patch<User>(`/admin/users/${id}`, dto);
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    await api.delete(`/admin/users/${id}`);
  },

  async getStatistics(dateFrom: string, dateTo: string, includeActiveSessions = false): Promise<StatsSummary> {
    const { data } = await api.get<StatsSummary>('/admin/statistics', {
      params: { dateFrom, dateTo, includeActiveSessions },
    });
    return data;
  },

  async getSettings(): Promise<SystemSetting[]> {
    const { data } = await api.get<SystemSetting[]>('/admin/settings');
    return data;
  },

  async upsertSetting(dto: UpsertSettingDto): Promise<SystemSetting> {
    const { data } = await api.post<SystemSetting>('/admin/settings', dto);
    return data;
  },

  async getBookDatabase(
    page = 1,
    limit = 20,
    search?: string,
    filters?: {
      boxId?: string;
      createdById?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      priceMin?: string;
      priceMax?: string;
      yearFrom?: string;
      yearTo?: string;
    },
  ): Promise<PaginatedResponse<Book>> {
    const { data } = await api.get<PaginatedResponse<Book>>('/admin/books/database', {
      params: { page, limit, search, ...filters },
    });
    return data;
  },

  async getPendingReviewBooks(
    page = 1,
    limit = 20,
    filters?: {
      boxId?: string;
      createdById?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      priceMin?: string;
      priceMax?: string;
      yearFrom?: string;
      yearTo?: string;
    },
  ): Promise<PaginatedResponse<Book>> {
    const { data } = await api.get<PaginatedResponse<Book>>('/admin/books/pending-review', {
      params: { page, limit, ...filters },
    });
    return data;
  },

  async getPendingReviewCountsByBox(): Promise<Array<{ boxId: string; boxNumber: string; count: number }>> {
    const { data } = await api.get('/admin/books/pending-review/counts-by-box');
    return data;
  },

  async getFailedPublicationBooks(page = 1, limit = 20): Promise<PaginatedResponse<Book>> {
    const { data } = await api.get<PaginatedResponse<Book>>('/admin/books/failed-publication', {
      params: { page, limit },
    });
    return data;
  },

  async getPendingReviewIds(boxId: string): Promise<string[]> {
    const { data } = await api.get<string[]>('/admin/books/pending-review/ids', {
      params: { boxId },
    });
    return data;
  },

  async getOzonStores(): Promise<{ stores: OzonStore[]; activeId: string }> {
    const { data } = await api.get<{ stores: OzonStore[]; activeId: string }>('/ozon/stores');
    return data;
  },

  async addOzonStore(dto: { name: string; clientId: string; apiKey: string }): Promise<OzonStore> {
    const { data } = await api.post<OzonStore>('/ozon/stores', dto);
    return data;
  },

  async removeOzonStore(id: string): Promise<void> {
    await api.delete(`/ozon/stores/${id}`);
  },

  async activateOzonStore(id: string): Promise<void> {
    await api.patch(`/ozon/stores/${id}/activate`);
  },

  async getOzonStoreLimits(id: string): Promise<OzonStoreLimits> {
    const { data } = await api.get<OzonStoreLimits>(`/ozon/stores/${id}/limits`);
    return data;
  },

  async getOzonStoreKeyExpiry(id: string): Promise<string | null> {
    const { data } = await api.get<{ expiresAt: string | null }>(`/ozon/stores/${id}/key-expiry`);
    return data.expiresAt;
  },

  async getAllNewOzonProductIds(storeId?: string): Promise<{ productIds: number[]; total: number }> {
    const params = storeId ? `?storeId=${storeId}` : '';
    const { data } = await api.get(`/ozon/import/new-ids${params}`);
    return data;
  },

  async getOzonProductsForImport(
    storeId?: string,
    page = 1,
    limit = 50,
  ): Promise<{
    items: Array<{
      productId: number;
      offerId: string;
      name: string;
      alreadyImported: boolean;
      bookId?: string;
    }>;
    total: number;
    page: number;
  }> {
    const { data } = await api.get('/ozon/import/list', {
      params: { storeId, page, limit },
    });
    return data;
  },

  async importOzonProducts(dto: {
    productIds: number[];
    storeId?: string;
  }): Promise<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    failedItems: Array<{ productId: number; error: string }>;
  }> {
    const { data } = await api.post('/ozon/import', dto);
    return data;
  },

  async backfillStoreIds(): Promise<{ updated: number; stores: number }> {
    const { data } = await api.post('/ozon/backfill-store-ids', {});
    return data;
  },

  async resetStuckPublications(): Promise<{ checked: number; published: number; failed: number }> {
    const { data } = await api.post('/ozon/reset-stuck-publications', {});
    return data;
  },
};
