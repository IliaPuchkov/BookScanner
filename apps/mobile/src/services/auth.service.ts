import api from './api';
import type { LoginResponse, User } from '../types';

export const authService = {
  async login(phoneOrEmail: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      phoneOrEmail,
      password,
    });
    return data;
  },

  async register(fullName: string, phone: string, email: string, password: string) {
    const { data } = await api.post('/auth/register', {
      fullName,
      phone,
      email,
      password,
    });
    return data;
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<User>('/users/me');
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },
};
