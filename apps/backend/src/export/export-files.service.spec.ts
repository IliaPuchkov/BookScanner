import { NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExportFilesService, EXPORT_TTL_DAYS } from './export-files.service';
import { ExportService } from './export.service';
import type { ExportFile } from './entities/export-file.entity';

function setup() {
  const stored = new Map<string, Buffer>();
  const storage = {
    upload: jest.fn(async (file: { buffer: Buffer }, key: string) => {
      stored.set(key, file.buffer);
      return { url: `s3://${key}`, key };
    }),
    download: jest.fn(async (key: string) => stored.get(key)!),
    delete: jest.fn(async (key: string) => {
      stored.delete(key);
    }),
    getSignedUrl: jest.fn(),
  };

  const rows: ExportFile[] = [];
  // tiny in-memory stand-in for the TypeORM repository: only the where shapes the service uses
  const matches = (f: ExportFile, where: any) =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      const val = (f as any)[k];
      if (v && typeof v === 'object' && '_type' in v) {
        return v._type === 'moreThan' ? val > v._value : val < v._value;
      }
      return val === v;
    });
  const repo = {
    create: (x: Partial<ExportFile>) => x as ExportFile,
    save: jest.fn(async (x: ExportFile) => {
      const row = { ...x, id: `id-${rows.length + 1}`, createdAt: new Date() } as ExportFile;
      rows.push(row);
      return row;
    }),
    find: jest.fn(async ({ where }: any) => rows.filter((f) => matches(f, where))),
    findOne: jest.fn(async ({ where }: any) => rows.find((f) => matches(f, where)) ?? null),
    delete: jest.fn(async (id: string) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    }),
  };

  const db = { query: jest.fn(async () => []) };
  const settings = { getValue: jest.fn(async (_k: string, def: unknown) => def) };
  const exportService = new ExportService(db as any, settings as any);
  const service = new ExportFilesService(exportService, repo as any, storage as any);
  return { service, storage, stored, rows };
}

const opts = { dateField: 'created' as const, fields: ['sku', 'title'], sheets: [], tzOffset: -180 };

describe('ExportFilesService', () => {
  it('stores the workbook and keeps it for 14 days', async () => {
    const { service, stored } = setup();
    const file = await service.create('admin-1', opts, 'jollybook_все_2026-11-26.xlsx');

    expect(file.fileName).toBe('jollybook_все_2026-11-26.xlsx');
    expect(file).not.toHaveProperty('fileKey');
    const days = (file.expiresAt.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(EXPORT_TTL_DAYS - 0.01);
    expect(days).toBeLessThanOrEqual(EXPORT_TTL_DAYS);

    const [key] = [...stored.keys()];
    expect(key).toMatch(/^exports\/[0-9a-f-]{36}\.xlsx$/);
    expect(file.sizeBytes).toBe(stored.get(key)!.length);

    const { buffer } = await service.read('admin-1', file.id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    expect((wb.getWorksheet('Товары')!.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Артикул (SKU)',
      'Название',
    ]);
  });

  it('another admin can neither see, download nor delete it', async () => {
    const { service, stored } = setup();
    const file = await service.create('admin-1', opts, 'a.xlsx');

    expect(await service.list('admin-2')).toEqual([]);
    await expect(service.read('admin-2', file.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('admin-2', file.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(stored.size).toBe(1);
    expect((await service.list('admin-1')).map((f) => f.id)).toEqual([file.id]);
  });

  it('the cron removes expired files from storage and the table', async () => {
    const { service, stored, rows } = setup();
    await service.create('admin-1', opts, 'old.xlsx');
    const fresh = await service.create('admin-1', opts, 'new.xlsx');
    rows[0].expiresAt = new Date(Date.now() - 1000);

    await service.cleanupExpired();

    expect(rows.map((r) => r.id)).toEqual([fresh.id]);
    expect(stored.size).toBe(1);
    await expect(service.read('admin-1', 'id-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
