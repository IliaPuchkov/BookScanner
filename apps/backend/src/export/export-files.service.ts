import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IStorageProvider, STORAGE_PROVIDER } from '../photos/storage/storage.interface';
import { ExportFile } from './entities/export-file.entity';
import { ExportOptions, ExportService } from './export.service';

export const EXPORT_TTL_DAYS = 14;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** What the client sees of a saved export (no storage key) */
export interface ExportFileInfo {
  id: string;
  fileName: string;
  sizeBytes: number;
  bookCount: number;
  params: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

function info(f: ExportFile): ExportFileInfo {
  return {
    id: f.id,
    fileName: f.fileName,
    sizeBytes: f.sizeBytes,
    bookCount: f.bookCount,
    params: f.params,
    createdAt: f.createdAt,
    expiresAt: f.expiresAt,
  };
}

/**
 * Saved exports: the workbook is written to a temp file, put into storage (S3 or local) under an
 * unguessable key and recorded in export_files. Every query is scoped to the admin who made it.
 */
@Injectable()
export class ExportFilesService {
  private readonly logger = new Logger(ExportFilesService.name);

  constructor(
    private readonly exportService: ExportService,
    @InjectRepository(ExportFile) private readonly repo: Repository<ExportFile>,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async create(userId: string, opts: ExportOptions, fileName: string): Promise<ExportFileInfo> {
    const tmp = path.join(os.tmpdir(), `export-${randomUUID()}.xlsx`);
    try {
      const out = fs.createWriteStream(tmp);
      const closed = new Promise<void>((resolve, reject) => {
        out.on('close', () => resolve());
        out.on('error', reject);
      });
      const bookCount = await this.exportService.write(opts, out);
      await closed;

      const buffer = await fs.promises.readFile(tmp);
      const key = `exports/${randomUUID()}.xlsx`;
      await this.storage.upload(
        { buffer, mimetype: XLSX_MIME, originalname: fileName, size: buffer.length } as Express.Multer.File,
        key,
      );

      const saved = await this.repo.save(
        this.repo.create({
          userId,
          fileKey: key,
          fileName,
          sizeBytes: buffer.length,
          bookCount,
          params: {
            from: opts.from?.toISOString() ?? null,
            to: opts.to?.toISOString() ?? null,
            dateField: opts.dateField,
            fields: opts.fields,
            sheets: opts.sheets,
          },
          expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 3600 * 1000),
        }),
      );
      return info(saved);
    } finally {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
    }
  }

  async list(userId: string): Promise<ExportFileInfo[]> {
    const rows = await this.repo.find({
      where: { userId, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return rows.map(info);
  }

  /** Another admin's export answers 404 exactly like a missing one */
  private async own(userId: string, id: string): Promise<ExportFile> {
    const f = await this.repo.findOne({ where: { id, userId, expiresAt: MoreThan(new Date()) } });
    if (!f) throw new NotFoundException('Выгрузка не найдена или уже удалена');
    return f;
  }

  async read(userId: string, id: string): Promise<{ file: ExportFileInfo; buffer: Buffer }> {
    const f = await this.own(userId, id);
    return { file: info(f), buffer: await this.storage.download(f.fileKey) };
  }

  async remove(userId: string, id: string): Promise<void> {
    const f = await this.own(userId, id);
    await this.drop(f);
  }

  private async drop(f: ExportFile): Promise<void> {
    try {
      await this.storage.delete(f.fileKey);
    } catch (err) {
      // a file already gone must not keep the row (and the cron) stuck
      this.logger.warn(`Export file ${f.fileKey} not deleted: ${(err as Error).message}`);
    }
    await this.repo.delete(f.id);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    try {
      const expired = await this.repo.find({ where: { expiresAt: LessThan(new Date()) }, take: 500 });
      for (const f of expired) await this.drop(f);
      if (expired.length) this.logger.log(`Removed ${expired.length} expired Excel exports`);
    } catch (err) {
      this.logger.error('Excel export cleanup failed', err as Error);
    }
  }
}
