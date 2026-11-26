import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import api, { STORAGE_KEYS } from './api';
import { API_BASE_URL } from '../config';

export type ExportDateField = 'created' | 'published' | 'updated';

export interface ExportFieldInfo {
  key: string;
  label: string;
  default: boolean;
}

export interface ExportGroupInfo {
  id: string;
  title: string;
  fields: ExportFieldInfo[];
}

export interface ExportDescription {
  groups: ExportGroupInfo[];
  sheets: ExportFieldInfo[];
  /** how long the server keeps a saved export */
  ttlDays: number;
}

/** A saved export (GET /admin/export/files): only the admin's own */
export interface ExportFileInfo {
  id: string;
  fileName: string;
  sizeBytes: number;
  bookCount: number;
  params: {
    from: string | null;
    to: string | null;
    dateField: ExportDateField;
    fields: string[];
    sheets: string[];
  };
  createdAt: string;
  expiresAt: string;
}

export interface ExportPeriod {
  /** ISO instant, inclusive */
  from?: string;
  /** ISO instant, exclusive */
  to?: string;
  dateField: ExportDateField;
}

export interface ExportRequest extends ExportPeriod {
  fields: string[];
  sheets: string[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const exportService = {
  async describe(): Promise<ExportDescription> {
    const { data } = await api.get<ExportDescription>('/admin/export/fields');
    return data;
  },

  async count(p: ExportPeriod): Promise<number> {
    const { data } = await api.get<{ count: number }>('/admin/export/count', { params: p });
    return data.count;
  },

  /** Builds the workbook on the server and keeps it there (ttlDays) */
  async create(req: ExportRequest): Promise<ExportFileInfo> {
    const { data } = await api.post<ExportFileInfo>(
      '/admin/export',
      { ...req, tzOffset: new Date().getTimezoneOffset() },
      // a big period takes a while; nginx allows 300 s
      { timeout: 300000 },
    );
    return data;
  },

  async list(): Promise<ExportFileInfo[]> {
    const { data } = await api.get<ExportFileInfo[]>('/admin/export/files');
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/export/files/${id}`);
  },

  /**
   * Downloads a saved export into the app's cache and returns its file:// uri. The download goes
   * past axios (it can't write files), so a cheap axios call first lets the interceptor refresh
   * an expired access token.
   */
  async download(file: ExportFileInfo): Promise<string> {
    await api.get('/admin/export/fields');
    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const target = `${FileSystem.cacheDirectory}${file.fileName}`;
    const res = await FileSystem.downloadAsync(`${API_BASE_URL}/admin/export/files/${file.id}`, target, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (res.status !== 200) {
      let message = `Сервер ответил ${res.status}`;
      try {
        const body = JSON.parse(await FileSystem.readAsStringAsync(target));
        if (body?.message) message = Array.isArray(body.message) ? body.message.join('\n') : body.message;
      } catch {
        // not JSON — keep the status
      }
      await FileSystem.deleteAsync(target, { idempotent: true });
      throw new Error(message);
    }
    return res.uri;
  },

  /**
   * Android: the admin picks a folder (Загрузки, Документы…) and the file is copied there.
   * Returns false when the folder picker was cancelled.
   */
  async saveToFolderAndroid(fileUri: string, fileName: string): Promise<boolean> {
    const saf = FileSystem.StorageAccessFramework;
    const perm = await saf.requestDirectoryPermissionsAsync();
    if (!perm.granted) return false;
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const dest = await saf.createFileAsync(perm.directoryUri, fileName.replace(/\.xlsx$/, ''), XLSX_MIME);
    await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
    return true;
  },
};
