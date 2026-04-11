import axios from 'axios';
import { API_BASE_URL } from '../config';

export interface MaintenanceStatus {
  isActive: boolean;
  isWarning: boolean;
  startsAt: string | null;
  endsAt: string | null;
  message: string | null;
  instructions: string | null;
}

export const maintenanceService = {
  async getStatus(): Promise<MaintenanceStatus> {
    const { data } = await axios.get<MaintenanceStatus>(
      `${API_BASE_URL}/maintenance`,
      { timeout: 8000 },
    );
    return data;
  },
};
