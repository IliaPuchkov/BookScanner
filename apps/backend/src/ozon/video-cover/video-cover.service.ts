import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { BookStatus } from '@bookscanner/shared';
import { Book } from '../../books/entities/book.entity';
import { BookPhoto } from '../../photos/entities/book-photo.entity';
import { IStorageProvider, STORAGE_PROVIDER } from '../../photos/storage/storage.interface';
import { SettingsService } from '../../settings/settings.service';
import { OzonApiClient } from '../ozon-api.client';
import { VIDEO_COVER } from './render-video-cover';
import { VIDEO_COVER_JOBS, VIDEO_COVER_QUEUE } from './video-cover.constants';

export const VIDEO_COVER_ENABLED_KEY = 'ozon_video_cover_enabled';
/** «Озон.Видеообложка: ссылка» — same id in both our book categories */
export const OZON_ATTR_VIDEO_COVER = 21845;
export const OZON_VIDEO_COVER_COMPLEX_ID = 100002;

const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
const PUSH_BATCH = 100;
const PUSH_SCAN_LIMIT = 2000;

/** Identifies the photo set a cover was made from: new/removed/reordered photos change it. */
export function photosHash(photos: Array<Pick<BookPhoto, 'fileUrl' | 'sortOrder'>>): string {
  const urls = [...photos].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.fileUrl);
  return createHash('sha1').update(urls.join('\n')).digest('hex').slice(0, 16);
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

export interface VideoCoverStatus {
  enabled: boolean;
  published: number;
  withCover: number;
  synced: number;
  waitingForOzon: number;
  queue: { waiting: number; active: number; failed: number };
}

@Injectable()
export class VideoCoverService {
  private readonly logger = new Logger(VideoCoverService.name);
  private pushRunning = false;

  constructor(
    @InjectRepository(Book)
    private readonly bookRepository: Repository<Book>,
    @InjectRepository(BookPhoto)
    private readonly photoRepository: Repository<BookPhoto>,
    @InjectQueue(VIDEO_COVER_QUEUE)
    private readonly queue: Queue,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: IStorageProvider,
    private readonly settingsService: SettingsService,
    private readonly ozonApiClient: OzonApiClient,
  ) {}

  isEnabled(): Promise<boolean> {
    return this.settingsService.getValue<boolean>(VIDEO_COVER_ENABLED_KEY, false);
  }

  async setEnabled(enabled: boolean): Promise<VideoCoverStatus> {
    await this.settingsService.upsert({
      key: VIDEO_COVER_ENABLED_KEY,
      value: String(enabled),
      valueType: 'boolean',
      description: 'Видеообложки на Ozon: собирать после публикации и отправлять в карточки',
    });
    return this.status();
  }

  /**
   * Queues a server-side render. Called after a book goes live on Ozon (only while the
   * feature is on) and by the admin «пересобрать» endpoint (`force`).
   */
  async enqueue(bookId: string, force = false): Promise<boolean> {
    if (!force && !(await this.isEnabled())) return false;
    await this.queue.add(
      VIDEO_COVER_JOBS.RENDER,
      { bookId, force },
      {
        jobId: `video-cover-${bookId}`, // one pending job per book
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 200,
      },
    );
    return true;
  }

  /** Renders (unless the current cover already matches the photos) and stores the cover. */
  async renderForBook(bookId: string, force = false): Promise<'rendered' | 'up-to-date' | 'skipped'> {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book || book.status !== BookStatus.PUBLISHED) return 'skipped';
    const photos = await this.photoRepository.find({ where: { bookId }, order: { sortOrder: 'ASC' } });
    if (!photos.length) return 'skipped';

    const hash = photosHash(photos);
    if (!force && book.videoCoverUrl && book.videoCoverHash === hash) return 'up-to-date';

    const dir = await mkdtemp(path.join(tmpdir(), 'video-cover-'));
    try {
      const inputs: string[] = [];
      for (const [i, photo] of photos.entries()) {
        const file = path.join(dir, `${i}.jpg`);
        await writeFile(file, await this.downloadPhoto(photo));
        inputs.push(file);
      }
      const out = path.join(dir, 'cover.mp4');
      const started = Date.now();
      await this.renderInChildProcess(out, inputs);
      const video = await readFile(out);
      this.logger.log(
        `Book ${bookId}: video cover rendered in ${((Date.now() - started) / 1000).toFixed(1)}s, ${(video.length / 1e6).toFixed(1)} MB`,
      );
      await this.store(book, video, hash);
      return 'rendered';
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Cover rendered elsewhere (the workstation backfill script). */
  async acceptUpload(bookId: string, file: Express.Multer.File | undefined, hash: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Нет файла видео');
    if (file.size > VIDEO_COVER.MAX_BYTES) throw new BadRequestException('Видео больше 20 МБ');

    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Книга не найдена');
    if (book.status !== BookStatus.PUBLISHED) {
      throw new ConflictException('Книга не опубликована на Ozon');
    }
    const photos = await this.photoRepository.find({ where: { bookId }, order: { sortOrder: 'ASC' } });
    if (photosHash(photos) !== hash) {
      throw new ConflictException('Фото книги изменились — соберите видеообложку заново');
    }

    await this.checkVideo(file.buffer);
    const videoCoverUrl = await this.store(book, file.buffer, hash);
    return { bookId, videoCoverUrl };
  }

  /**
   * Published books with no cover yet, with their photos in display order — the work list
   * for the backfill script. Keyset-paged by id.
   */
  async listPending(limit: number, after?: string) {
    const take = Math.min(Math.max(limit || 50, 1), 200);
    const params: unknown[] = [BookStatus.PUBLISHED, take];
    let cursor = '';
    if (after) {
      params.push(after);
      cursor = 'AND b.id > $3';
    }
    const books: Array<{ id: string; sku: string }> = await this.bookRepository.query(
      `SELECT b.id, b.sku FROM books b
        WHERE b.status = $1 AND b."videoCoverUrl" IS NULL ${cursor}
          AND EXISTS (SELECT 1 FROM book_photos p WHERE p.book_id = b.id)
        ORDER BY b.id LIMIT $2`,
      params,
    );
    const [{ count }] = await this.bookRepository.query(
      `SELECT count(*)::int AS count FROM books b
        WHERE b.status = $1 AND b."videoCoverUrl" IS NULL
          AND EXISTS (SELECT 1 FROM book_photos p WHERE p.book_id = b.id)`,
      [BookStatus.PUBLISHED],
    );
    if (!books.length) return { remaining: count, items: [] };

    const photos: Array<{ bookId: string; fileUrl: string; sortOrder: number }> = await this.photoRepository.query(
      `SELECT book_id AS "bookId", "fileUrl", "sortOrder" FROM book_photos
        WHERE book_id = ANY($1) ORDER BY book_id, "sortOrder"`,
      [books.map((b) => b.id)],
    );
    const byBook = new Map<string, typeof photos>();
    for (const p of photos) {
      const list = byBook.get(p.bookId) ?? [];
      list.push(p);
      byBook.set(p.bookId, list);
    }
    return {
      remaining: count,
      items: books.map((b) => {
        const list = byBook.get(b.id) ?? [];
        return { bookId: b.id, sku: b.sku, photosHash: photosHash(list), photos: list.map((p) => p.fileUrl) };
      }),
    };
  }

  async status(): Promise<VideoCoverStatus> {
    const [row] = await this.bookRepository.query(
      `SELECT
         count(*) FILTER (WHERE status = $1)::int AS published,
         count(*) FILTER (WHERE status = $1 AND "videoCoverUrl" IS NOT NULL)::int AS "withCover",
         count(*) FILTER (WHERE status = $1 AND "videoCoverSyncedAt" IS NOT NULL)::int AS synced,
         count(*) FILTER (WHERE status = $1 AND "videoCoverUrl" IS NOT NULL AND "videoCoverSyncedAt" IS NULL)::int AS "waitingForOzon"
       FROM books`,
      [BookStatus.PUBLISHED],
    );
    const counts = await this.queue.getJobCounts('waiting', 'delayed', 'active', 'failed');
    return {
      enabled: await this.isEnabled(),
      ...row,
      queue: {
        waiting: (counts.waiting ?? 0) + (counts.delayed ?? 0),
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  }

  /**
   * Sends stored covers to Ozon: only attribute 21845 via /v1/product/attributes/update, with the
   * credentials of the store the book is published in, in batches of 100, within the store's
   * daily_update limit. Runs from the cron while the feature is on.
   */
  async pushPending(): Promise<{ sent: number; failed: number }> {
    if (this.pushRunning) return { sent: 0, failed: 0 };
    this.pushRunning = true;
    let sent = 0;
    let failed = 0;
    try {
      const rows: Array<{ id: string; sku: string; url: string; storeId: string | null }> =
        await this.bookRepository.query(
          `SELECT b.id, b.sku, b."videoCoverUrl" AS url, op."storeId" AS "storeId"
             FROM books b LEFT JOIN ozon_products op ON op.book_id = b.id
            WHERE b."videoCoverUrl" IS NOT NULL AND b."videoCoverSyncedAt" IS NULL AND b.status = $1
            ORDER BY b.id LIMIT $2`,
          [BookStatus.PUBLISHED, PUSH_SCAN_LIMIT],
        );
      if (!rows.length) return { sent, failed };

      const byStore = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = r.storeId ?? '';
        byStore.set(key, [...(byStore.get(key) ?? []), r]);
      }

      for (const [storeKey, group] of byStore) {
        const storeId = storeKey || undefined;
        let allowed = group.length;
        try {
          const limits = await this.ozonApiClient.getProductLimits(storeId);
          if (limits.daily_update?.limit > 0) {
            allowed = Math.min(allowed, Math.max(limits.daily_update.limit - limits.daily_update.usage, 0));
          }
        } catch (error) {
          this.logger.warn(`Video covers: limits check failed for store ${storeKey || 'active'} — ${error}`);
        }
        if (allowed <= 0) {
          this.logger.log(`Video covers: daily update limit reached for store ${storeKey || 'active'}, later`);
          continue;
        }

        const todo = group.slice(0, allowed);
        for (let i = 0; i < todo.length; i += PUSH_BATCH) {
          const batch = todo.slice(i, i + PUSH_BATCH);
          try {
            const taskId = await this.ozonApiClient.updateAttributes(
              batch.map((r) => ({
                offer_id: r.sku,
                attributes: [
                  { id: OZON_ATTR_VIDEO_COVER, complex_id: OZON_VIDEO_COVER_COMPLEX_ID, values: [{ value: r.url }] },
                ],
              })),
              storeId,
            );
            await this.bookRepository.query(
              `UPDATE books SET "videoCoverSyncedAt" = now() WHERE id = ANY($1)`,
              [batch.map((r) => r.id)],
            );
            sent += batch.length;
            this.logger.log(`Video covers: ${batch.length} sent to store ${storeKey || 'active'}, task ${taskId}`);
          } catch (error) {
            failed += batch.length;
            this.logger.error(`Video covers: push to store ${storeKey || 'active'} failed — ${error}`);
            break; // try this store again on the next run
          }
        }
      }
      return { sent, failed };
    } finally {
      this.pushRunning = false;
    }
  }

  private async store(book: Book, video: Buffer, hash: string): Promise<string> {
    const key = `videos/${book.id}/cover-${hash}.mp4`;
    const uploaded = await this.storage.upload(
      { buffer: video, mimetype: 'video/mp4', size: video.length } as Express.Multer.File,
      key,
    );
    // raw SQL: a cover must not bump updatedAt (lists are sorted by it)
    await this.bookRepository.query(
      `UPDATE books SET "videoCoverUrl" = $2, "videoCoverKey" = $3, "videoCoverHash" = $4, "videoCoverSyncedAt" = NULL
        WHERE id = $1`,
      [book.id, uploaded.url, uploaded.key, hash],
    );
    if (book.videoCoverKey && book.videoCoverKey !== uploaded.key) {
      await this.storage.delete(book.videoCoverKey).catch((err) =>
        this.logger.warn(`Failed to delete old video cover ${book.videoCoverKey}: ${err}`),
      );
    }
    return uploaded.url;
  }

  private async downloadPhoto(photo: BookPhoto): Promise<Buffer> {
    if (photo.fileKey) {
      try {
        return await this.storage.download(photo.fileKey);
      } catch {
        // fall back to the public URL (photos imported from Ozon have no key in our bucket)
      }
    }
    const res = await fetch(photo.fileUrl);
    if (!res.ok) throw new Error(`Photo ${photo.id}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Separate, low-priority process: keeps the API responsive on the single vCPU. */
  private async renderInChildProcess(out: string, inputs: string[]): Promise<void> {
    const worker = path.join(__dirname, 'render-worker.js');
    const [cmd, args] =
      process.platform === 'win32'
        ? [process.execPath, [worker, out, ...inputs]]
        : ['nice', ['-n', '15', process.execPath, worker, out, ...inputs]];
    const { code, err } = await run(cmd, args, RENDER_TIMEOUT_MS);
    if (code !== 0) throw new Error(`Video cover render failed (${code}): ${err.trim().slice(-500)}`);
  }

  /** Rejects uploads Ozon would refuse: not H.264 MP4, not 3:4, shorter than 8 s or longer than 30 s. */
  private async checkVideo(video: Buffer): Promise<void> {
    const dir = await mkdtemp(path.join(tmpdir(), 'video-check-'));
    try {
      const file = path.join(dir, 'v.mp4');
      await writeFile(file, video);
      const { code, out } = await run(
        process.env.FFPROBE_PATH || 'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration,format_name', '-of', 'json', file],
        30_000,
      );
      if (code !== 0) throw new BadRequestException('Файл не похож на видео');
      const info = JSON.parse(out);
      const stream = info.streams?.[0];
      const duration = Number(info.format?.duration);
      if (!String(info.format?.format_name).includes('mp4') || stream?.codec_name !== 'h264') {
        throw new BadRequestException('Нужен MP4 (H.264)');
      }
      if (!(duration >= VIDEO_COVER.DURATION_S - 0.01 && duration <= 30)) {
        throw new BadRequestException(`Длительность ${duration} с — Ozon принимает от 8 до 30 с`);
      }
      if (Math.abs(stream.width / stream.height - 3 / 4) > 0.01) {
        throw new BadRequestException(`Пропорции ${stream.width}×${stream.height} — нужно 3:4`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
