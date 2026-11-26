import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookStatus } from '@bookscanner/shared';
import { Book } from '../../books/entities/book.entity';
import { IStorageProvider, STORAGE_PROVIDER } from '../../photos/storage/storage.interface';
import { SettingsService } from '../../settings/settings.service';
import { OzonApiClient } from '../ozon-api.client';
import { ContentScopeService } from '../content-scope.service';
import { ExtraPhotoBook, extraPhotosHash, renderExtraPhotos, shopName } from './render-extra-photos';

export const EXTRA_PHOTOS_ENABLED_KEY = 'ozon_extra_photos_enabled';
/** trial cap: at most this many books get extra photos in total (within the scope); 0 = no cap */
export const EXTRA_PHOTOS_MAX_BOOKS_KEY = 'ozon_extra_photos_max_books';

/** books drawn per cron run (~1–2 s each on the server) */
const RENDER_PER_RUN = 60;
const PUSH_BATCH = 100;
/** photos of the book the cards use: the cover + up to 3 for «Состояние» */
const PHOTOS_USED = 4;
/** Ozon's limit of images per product */
const OZON_MAX_IMAGES = 30;

type BookRow = ExtraPhotoBook & {
  id: string;
  sku: string;
  storeId: string | null;
  extraPhotosUrls: string[] | null;
  extraPhotosHash: string | null;
};
type PhotoRow = { bookId: string; fileUrl: string; fileKey: string | null };

export interface ExtraPhotosStatus {
  enabled: boolean;
  published: number;
  rendered: number;
  synced: number;
}

/**
 * Extra photos on Ozon: draws «Об издании», «О книге», «Состояние» and the shop's note for
 * published books and appends them to the product's photos (after the book's own ones) via
 * /v2/product/pictures/import — only photos change, price and attributes stay. Runs from the cron
 * while the setting is on, for the stores of the content scope (ContentScopeService).
 */
@Injectable()
export class ExtraPhotosService {
  private readonly logger = new Logger(ExtraPhotosService.name);
  private pushRunning = false;

  constructor(
    @InjectRepository(Book)
    private readonly bookRepository: Repository<Book>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: IStorageProvider,
    private readonly settingsService: SettingsService,
    private readonly ozonApiClient: OzonApiClient,
    private readonly scope: ContentScopeService,
  ) {}

  isEnabled(): Promise<boolean> {
    return this.settingsService.getValue<boolean>(EXTRA_PHOTOS_ENABLED_KEY, false);
  }

  async setEnabled(enabled: boolean): Promise<ExtraPhotosStatus> {
    await this.settingsService.upsert({
      key: EXTRA_PHOTOS_ENABLED_KEY,
      value: String(enabled),
      valueType: 'boolean',
      description: 'Доп. фото на Ozon: «Об издании», «О книге», «Состояние» и записка магазина после фото книги',
    });
    return this.status();
  }

  /** Extra photo URLs to append on (re)publication, so an import doesn't drop them; [] when off / out of scope. */
  async forPublish(book: Pick<Book, 'extraPhotosUrls'>, storeId: string | null | undefined): Promise<string[]> {
    if (!book.extraPhotosUrls?.length) return [];
    if (!(await this.isEnabled()) || !(await this.scope.allows(storeId))) return [];
    return book.extraPhotosUrls;
  }

  async status(): Promise<ExtraPhotosStatus> {
    const params: unknown[] = [BookStatus.PUBLISHED];
    const inScope = ContentScopeService.sql(await this.scope.get(), params);
    const [row] = await this.bookRepository.query(
      `SELECT count(*)::int AS published,
              count(*) FILTER (WHERE b."extraPhotosUrls" IS NOT NULL)::int AS rendered,
              count(*) FILTER (WHERE b."extraPhotosSyncedAt" IS NOT NULL)::int AS synced
         FROM books b LEFT JOIN ozon_products op ON op.book_id = b.id
        WHERE b.status = $1 ${inScope}`,
      params,
    );
    return { enabled: await this.isEnabled(), ...row };
  }

  /**
   * Draws the extra photos of up to RENDER_PER_RUN published in-scope books that Ozon hasn't got
   * them for, then sends each store its photo lists in batches of 100 within daily_update.
   */
  async pushPending(): Promise<{ rendered: number; sent: number; failed: number }> {
    const result = { rendered: 0, sent: 0, failed: 0 };
    if (this.pushRunning) return result;
    this.pushRunning = true;
    try {
      const scope = await this.scope.get();
      let perRun = RENDER_PER_RUN;
      const cap = Number(await this.settingsService.getValue<number>(EXTRA_PHOTOS_MAX_BOOKS_KEY, 0)) || 0;
      if (cap > 0) {
        const { synced } = await this.status();
        perRun = Math.min(perRun, cap - synced);
        if (perRun <= 0) return result;
      }
      const params: unknown[] = [BookStatus.PUBLISHED, perRun];
      const inScope = ContentScopeService.sql(scope, params);
      const books: BookRow[] = await this.bookRepository.query(
        `SELECT b.id, b.sku, b.title, b.author, b.publisher, b."yearPublished", b."coverType", b."paperType",
                b."pageCount", b."printRun", b.language, b.isbn, b.condition, b.annotation,
                b."extraPhotosUrls", b."extraPhotosHash", op."storeId" AS "storeId"
           FROM books b LEFT JOIN ozon_products op ON op.book_id = b.id
          WHERE b.status = $1 AND b."extraPhotosSyncedAt" IS NULL ${inScope}
            AND EXISTS (SELECT 1 FROM book_photos p WHERE p.book_id = b.id)
          ORDER BY b.id LIMIT $2`,
        params,
      );
      if (!books.length) return result;

      const photoRows: PhotoRow[] = await this.bookRepository.query(
        `SELECT book_id AS "bookId", "fileUrl", "fileKey" FROM book_photos
          WHERE book_id = ANY($1) ORDER BY book_id, "sortOrder"`,
        [books.map((b) => b.id)],
      );
      const photos = new Map<string, PhotoRow[]>();
      for (const p of photoRows) photos.set(p.bookId, [...(photos.get(p.bookId) ?? []), p]);

      const storeNames = new Map((await this.ozonApiClient.getAllStores()).map((s) => [s.id, s.name]));

      // 1. draw what is missing or outdated
      const ready: Array<{ book: BookRow; images: string[] }> = [];
      for (const book of books) {
        const own = photos.get(book.id) ?? [];
        const ownUrls = own.map((p) => p.fileUrl);
        try {
          const shop = shopName(storeNames.get(book.storeId || scope.activeStoreId || ''));
          const hash = extraPhotosHash(book, ownUrls.slice(0, PHOTOS_USED), shop);
          let extra = book.extraPhotosUrls;
          if (!extra?.length || book.extraPhotosHash !== hash) {
            extra = await this.render(book, own.slice(0, PHOTOS_USED), shop, hash);
            result.rendered++;
          }
          ready.push({ book, images: [...ownUrls, ...extra].slice(0, OZON_MAX_IMAGES) });
        } catch (error) {
          result.failed++;
          this.logger.error(`Extra photos: ${book.sku} not drawn — ${error}`);
        }
      }

      // 2. send per store
      const byStore = new Map<string, typeof ready>();
      for (const r of ready) byStore.set(r.book.storeId ?? '', [...(byStore.get(r.book.storeId ?? '') ?? []), r]);
      for (const [storeKey, group] of byStore) {
        const storeId = storeKey || undefined;
        let allowed = group.length;
        try {
          const limits = await this.ozonApiClient.getProductLimits(storeId);
          if (limits.daily_update?.limit > 0) {
            allowed = Math.min(allowed, Math.max(limits.daily_update.limit - limits.daily_update.usage, 0));
          }
        } catch (error) {
          this.logger.warn(`Extra photos: limits check failed for store ${storeKey || 'active'} — ${error}`);
        }
        if (allowed <= 0) {
          this.logger.log(`Extra photos: daily update limit reached for store ${storeKey || 'active'}, later`);
          continue;
        }
        const todo = group.slice(0, allowed);
        for (let i = 0; i < todo.length; i += PUSH_BATCH) {
          const batch = todo.slice(i, i + PUSH_BATCH);
          try {
            const taskId = await this.ozonApiClient.importPictures(
              batch.map((r) => ({ offer_id: r.book.sku, images: r.images })),
              storeId,
            );
            await this.bookRepository.query(`UPDATE books SET "extraPhotosSyncedAt" = now() WHERE id = ANY($1)`, [
              batch.map((r) => r.book.id),
            ]);
            result.sent += batch.length;
            this.logger.log(`Extra photos: ${batch.length} sent to store ${storeKey || 'active'}, task ${taskId}`);
          } catch (error) {
            result.failed += batch.length;
            this.logger.error(`Extra photos: push to store ${storeKey || 'active'} failed — ${error}`);
            break; // this store again on the next run
          }
        }
      }
      return result;
    } finally {
      this.pushRunning = false;
    }
  }

  private async render(book: BookRow, own: PhotoRow[], shop: string, hash: string): Promise<string[]> {
    const buffers = await Promise.all(own.map((p) => this.download(p)));
    const images = await renderExtraPhotos(book, buffers, shop);
    const urls: string[] = [];
    for (let n = 0; n < images.length; n++) {
      const uploaded = await this.storage.upload(
        { buffer: images[n], mimetype: 'image/jpeg', size: images[n].length } as Express.Multer.File,
        `books/${book.id}/generated/${hash}-${n + 1}.jpg`,
      );
      urls.push(uploaded.url);
    }
    // raw SQL: background work must not bump updatedAt (lists are sorted by it)
    await this.bookRepository.query(
      `UPDATE books SET "extraPhotosUrls" = $2::jsonb, "extraPhotosHash" = $3, "extraPhotosSyncedAt" = NULL WHERE id = $1`,
      [book.id, JSON.stringify(urls), hash],
    );
    if (book.extraPhotosHash && book.extraPhotosHash !== hash) {
      for (let n = 1; n <= (book.extraPhotosUrls?.length ?? 0); n++) {
        const key = `books/${book.id}/generated/${book.extraPhotosHash}-${n}.jpg`;
        await this.storage.delete(key).catch((err) => this.logger.warn(`Failed to delete old ${key}: ${err}`));
      }
    }
    return urls;
  }

  private async download(photo: PhotoRow): Promise<Buffer> {
    if (photo.fileKey) {
      try {
        return await this.storage.download(photo.fileKey);
      } catch {
        // fall back to the public URL (photos imported from Ozon have no key in our bucket)
      }
    }
    const res = await fetch(photo.fileUrl);
    if (!res.ok) throw new Error(`photo ${photo.fileUrl}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
