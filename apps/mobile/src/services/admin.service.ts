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

  async getStatistics(days = 7): Promise<StatsSummary> {
    const { data } = await api.get<StatsSummary>('/admin/statistics', {
      params: { days },
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
  ): Promise<PaginatedResponse<Book>> {
    const { data } = await api.get<PaginatedResponse<Book>>('/admin/books/database', {
      params: { page, limit, search },
    });
    return data;
  },
};
