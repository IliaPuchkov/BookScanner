import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookStatus } from '@bookscanner/shared';
import { Book } from '../../books/entities/book.entity';
import { SettingsService } from '../../settings/settings.service';
import { OzonApiClient } from '../ozon-api.client';
import { ContentScopeService } from '../content-scope.service';
import { buildRichContent, OZON_ATTR_RICH_CONTENT, RichPhoto } from './rich-content.builder';

export const RICH_CONTENT_ENABLED_KEY = 'ozon_rich_content_enabled';

const PUSH_BATCH = 100;
const PUSH_SCAN_LIMIT = 1000;
/** the chess layout uses at most this many photos (one per section) */
const PHOTOS_USED = 3;

type BookRow = Pick<
  Book,
  | 'id'
  | 'sku'
  | 'title'
  | 'author'
  | 'publisher'
  | 'yearPublished'
  | 'coverType'
  | 'paperType'
  | 'pageCount'
  | 'printRun'
  | 'language'
  | 'isbn'
  | 'condition'
  | 'annotation'
> & { storeId: string | null };

export interface RichContentStatus {
  enabled: boolean;
  published: number;
  synced: number;
}

@Injectable()
export class RichContentService {
  private readonly logger = new Logger(RichContentService.name);
  private pushRunning = false;

  constructor(
    @InjectRepository(Book)
    private readonly bookRepository: Repository<Book>,
    private readonly settingsService: SettingsService,
    private readonly ozonApiClient: OzonApiClient,
    private readonly scope: ContentScopeService,
  ) {}

  isEnabled(): Promise<boolean> {
    return this.settingsService.getValue<boolean>(RICH_CONTENT_ENABLED_KEY, false);
  }

  async setEnabled(enabled: boolean): Promise<RichContentStatus> {
    await this.settingsService.upsert({
      key: RICH_CONTENT_ENABLED_KEY,
      value: String(enabled),
      valueType: 'boolean',
      description: 'Rich-контент на Ozon: добавлять при публикации и досылать в опубликованные карточки',
    });
    return this.status();
  }

  /** JSON for attribute 11254 of a book loaded with its photos. */
  build(book: Book): string {
    const photos = [...(book.photos ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, PHOTOS_USED)
      .map((p) => ({ url: p.fileUrl }));
    return buildRichContent(book, photos);
  }

  /** Feature on and the store (empty = active store) in the content scope? */
  async enabledFor(storeId: string | null | undefined): Promise<boolean> {
    return (await this.isEnabled()) && (await this.scope.allows(storeId));
  }

  /** JSON for attribute 11254, or null while the feature is off / the store is out of scope. Used by publish. */
  async forPublish(book: Book, storeId: string | null | undefined): Promise<string | null> {
    return (await this.enabledFor(storeId)) ? this.build(book) : null;
  }

  /** After a book went live: if its import already carried rich content, nothing is left to send. */
  async markSentWithImport(bookId: string, publishPayload: Record<string, unknown> | null | undefined) {
    const items = (publishPayload?.items as Array<{ attributes?: Array<{ id: number }> }>) ?? [];
    if (!items[0]?.attributes?.some((a) => a.id === OZON_ATTR_RICH_CONTENT)) return;
    await this.markSynced([bookId]);
  }

  async status(): Promise<RichContentStatus> {
    const [row] = await this.bookRepository.query(
      `SELECT count(*)::int AS published,
              count(*) FILTER (WHERE "richContentSyncedAt" IS NOT NULL)::int AS synced
         FROM books WHERE status = $1`,
      [BookStatus.PUBLISHED],
    );
    return { enabled: await this.isEnabled(), ...row };
  }

  /**
   * Sends rich content to published books that don't have it yet: only attribute 11254 via
   * /v1/product/attributes/update, with the publishing store's credentials, batches of 100,
   * within the store's daily_update limit. Runs from the cron while the feature is on.
   */
  async pushPending(): Promise<{ sent: number; failed: number }> {
    if (this.pushRunning) return { sent: 0, failed: 0 };
    this.pushRunning = true;
    let sent = 0;
    let failed = 0;
    try {
      const params: unknown[] = [BookStatus.PUBLISHED, PUSH_SCAN_LIMIT];
      const inScope = ContentScopeService.sql(await this.scope.get(), params);
      const books: BookRow[] = await this.bookRepository.query(
        `SELECT b.id, b.sku, b.title, b.author, b.publisher, b."yearPublished", b."coverType", b."paperType",
                b."pageCount", b."printRun", b.language, b.isbn, b.condition, b.annotation, op."storeId" AS "storeId"
           FROM books b LEFT JOIN ozon_products op ON op.book_id = b.id
          WHERE b.status = $1 AND b."richContentSyncedAt" IS NULL ${inScope}
          ORDER BY b.id LIMIT $2`,
        params,
      );
      if (!books.length) return { sent, failed };

      const photoRows: Array<{ bookId: string; fileUrl: string }> = await this.bookRepository.query(
        `SELECT book_id AS "bookId", "fileUrl" FROM (
           SELECT book_id, "fileUrl", row_number() OVER (PARTITION BY book_id ORDER BY "sortOrder") AS n
             FROM book_photos WHERE book_id = ANY($1)
         ) p WHERE n <= $2 ORDER BY book_id, n`,
        [books.map((b) => b.id), PHOTOS_USED],
      );
      const photos = new Map<string, RichPhoto[]>();
      for (const p of photoRows) photos.set(p.bookId, [...(photos.get(p.bookId) ?? []), { url: p.fileUrl }]);

      const byStore = new Map<string, BookRow[]>();
      for (const b of books) byStore.set(b.storeId ?? '', [...(byStore.get(b.storeId ?? '') ?? []), b]);

      for (const [storeKey, group] of byStore) {
        const storeId = storeKey || undefined;
        let allowed = group.length;
        try {
          const limits = await this.ozonApiClient.getProductLimits(storeId);
          if (limits.daily_update?.limit > 0) {
            allowed = Math.min(allowed, Math.max(limits.daily_update.limit - limits.daily_update.usage, 0));
          }
        } catch (error) {
          this.logger.warn(`Rich content: limits check failed for store ${storeKey || 'active'} — ${error}`);
        }
        if (allowed <= 0) {
          this.logger.log(`Rich content: daily update limit reached for store ${storeKey || 'active'}, later`);
          continue;
        }

        const todo = group.slice(0, allowed);
        for (let i = 0; i < todo.length; i += PUSH_BATCH) {
          let batch = todo.slice(i, i + PUSH_BATCH);
          try {
            // never overwrite rich content made by hand in the seller cabinet (or sent earlier)
            const has = await this.ozonApiClient.offerIdsWithAttribute(
              batch.map((b) => b.sku),
              OZON_ATTR_RICH_CONTENT,
              storeId,
            );
            const keep = batch.filter((b) => has.has(b.sku));
            if (keep.length) {
              await this.markSynced(keep.map((b) => b.id));
              this.logger.log(`Rich content: ${keep.length} already had it on Ozon, left as is`);
            }
            batch = batch.filter((b) => !has.has(b.sku));
            if (!batch.length) continue;

            const taskId = await this.ozonApiClient.updateAttributes(
              batch.map((b) => ({
                offer_id: b.sku,
                attributes: [
                  {
                    id: OZON_ATTR_RICH_CONTENT,
                    complex_id: 0,
                    values: [{ value: buildRichContent(b, photos.get(b.id) ?? []) }],
                  },
                ],
              })),
              storeId,
            );
            await this.markSynced(batch.map((b) => b.id));
            sent += batch.length;
            this.logger.log(`Rich content: ${batch.length} sent to store ${storeKey || 'active'}, task ${taskId}`);
          } catch (error) {
            failed += batch.length;
            this.logger.error(`Rich content: push to store ${storeKey || 'active'} failed — ${error}`);
            break; // this store again on the next run
          }
        }
      }
      return { sent, failed };
    } finally {
      this.pushRunning = false;
    }
  }

  // raw SQL: must not bump updatedAt (lists are sorted by it)
  private markSynced(ids: string[]) {
    return this.bookRepository.query(`UPDATE books SET "richContentSyncedAt" = now() WHERE id = ANY($1)`, [ids]);
  }
}
