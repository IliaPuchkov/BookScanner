import api from './api';
import type { WorkSession } from '../types';

export const sessionsService = {
  async startSession(): Promise<WorkSession> {
    const { data } = await api.post<WorkSession>('/work-sessions/start');
    return data;
  },

  async getActiveSession(): Promise<WorkSession | null> {
    const { data } = await api.get<WorkSession | null>('/work-sessions/active');
    return data;
  },

  async endSession(id: string): Promise<WorkSession> {
    const { data } = await api.post<WorkSession>(`/work-sessions/${id}/end`);
    return data;
  },
};
