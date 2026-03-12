import api from './api';
import type { Box, CreateBoxDto, PaginatedResponse } from '../types';

export const boxesService = {
  async getBoxes(page = 1, limit = 20): Promise<PaginatedResponse<Box>> {
    const { data } = await api.get<PaginatedResponse<Box>>('/boxes', {
      params: { page, limit },
    });
    return data;
  },

  async getBox(id: string): Promise<Box> {
    const { data } = await api.get<Box>(`/boxes/${id}`);
    return data;
  },

  async createBox(dto: CreateBoxDto): Promise<Box> {
    const { data } = await api.post<Box>('/boxes/create', dto);
    return data;
  },

  async updateBox(id: string, dto: Partial<CreateBoxDto>): Promise<Box> {
    const { data } = await api.patch<Box>(`/boxes/${id}`, dto);
    return data;
  },

  async deleteBox(id: string): Promise<void> {
    await api.delete(`/boxes/${id}`);
  },
};
