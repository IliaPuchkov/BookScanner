import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { Writable } from 'stream';
import { SettingsService } from '../settings/settings.service';
import type { OzonStoreRecord } from '../ozon/dto/ozon-store.dto';
import {
  CellValue,
  ExportContext,
  ExportField,
  ExportRow,
  ExportSheetKey,
  EXPORT_SHEETS,
  resolveFields,
  toWallClock,
} from './export-fields';
import { ExportSummary } from './export-summary';

export type ExportDateField = 'created' | 'published' | 'updated';

export interface ExportOptions {
  from?: Date;
  to?: Date;
  dateField: ExportDateField;
  fields: string[];
  sheets: ExportSheetKey[];
  tzOffset: number;
}

const DATE_COLUMN: Record<ExportDateField, string> = {
  created: 'b."createdAt"',
  published: 'b."publishedToOzon"',
  updated: 'b."updatedAt"',
};

const BATCH = 1000;
/** Excel's limit for one cell */
const MAX_CELL_CHARS = 32000;
// Characters XML 1.0 can't hold — OCR text sometimes has them and Excel then refuses the file
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
  ) {}

  private where(opts: Pick<ExportOptions, 'from' | 'to' | 'dateField'>): { sql: string; params: unknown[] } {
    const col = DATE_COLUMN[opts.dateField];
    const parts: string[] = [];
    const params: unknown[] = [];
    // "by publication date" only makes sense for published books, even without a period
    if (opts.dateField === 'published') parts.push(`${col} IS NOT NULL`);
    if (opts.from) {
      params.push(opts.from);
      parts.push(`${col} >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      parts.push(`${col} < $${params.length}`);
    }
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
  }

  async count(opts: Pick<ExportOptions, 'from' | 'to' | 'dateField'>): Promise<number> {
    const { sql, params } = this.where(opts);
    const [row] = await this.dataSource.query(`SELECT count(*)::int AS n FROM books b ${sql}`, params);
    return row?.n ?? 0;
  }

  private async context(): Promise<ExportContext> {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>('ozon_stores', []);
    const activeId = await this.settingsService.getValue<string>('active_ozon_store_id', '');
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return {
      storeName: (id) => {
        // books published before stores were tracked have no storeId: they went to the active store
        const key = id || activeId;
        return names.get(key) ?? (key ? 'Удалённый магазин' : 'Основной магазин');
      },
    };
  }

  private async batch(where: { sql: string; params: unknown[] }, offset: number): Promise<ExportRow[]> {
    const rows: ExportRow[] = await this.dataSource.query(
      `SELECT b.id, b.sku, b.title, b.author, b.isbn, b.publisher, b."yearPublished", b."pageCount",
              b."printRun", b.language, b."coverType", b."paperType", b.condition, b."bookType",
              b.direction, b.price, b."priceReviewed", b."weightGross", b."weightNet", b.dimensions,
              b.annotation, b.hashtags, b.status, b."createdAt", b."updatedAt", b."publishedToOzon",
              b."isCopy", b."isCopyMaster", b."copyGroupId", b."addedToLibraryAt",
              b."videoCoverUrl", b."videoCoverSyncedAt", b."richContentSyncedAt",
              ph.cnt AS "photoCount", ph.urls AS "photoUrls",
              bx."boxNumber", bx.description AS "boxDescription",
              u.id AS "operatorId", u."fullName" AS "operatorName", u.phone AS "operatorPhone",
              u.email AS "operatorEmail", u.role AS "operatorRole", u."isApproved" AS "operatorApproved",
              u."createdAt" AS "operatorRegisteredAt",
              b.work_session_id AS "workSessionId",
              ws."startedAt" AS "sessionStartedAt", ws."endedAt" AS "sessionEndedAt", ws.status AS "sessionStatus",
              lo."fullName" AS "libraryOwnerName",
              op."storeId" AS "ozonStoreId", op."ozonProductId", op."taskId" AS "ozonTaskId",
              op.status AS "ozonStatus", op."errorMessage" AS "ozonError",
              op."averageMarketPrice" AS "ozonMarketPrice", op."createdAt" AS "ozonSentAt",
              op."updatedAt" AS "ozonUpdatedAt",
              o.status AS "ocrStatus", o."errorMessage" AS "ocrError", o."updatedAt" AS "ocrAt"
         FROM books b
         LEFT JOIN users u ON u.id = b.created_by
         LEFT JOIN boxes bx ON bx.id = b.box_id
         LEFT JOIN work_sessions ws ON ws.id = b.work_session_id
         LEFT JOIN users lo ON lo.id = b."libraryOwnerId"
         LEFT JOIN ozon_products op ON op.book_id = b.id
         LEFT JOIN ocr_results o ON o.book_id = b.id
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS cnt, string_agg(p."fileUrl", E'\\n' ORDER BY p."sortOrder") AS urls
             FROM book_photos p WHERE p.book_id = b.id
         ) ph ON true
         ${where.sql}
        ORDER BY b."createdAt", b.id
        LIMIT ${BATCH} OFFSET ${offset}`,
      where.params,
    );
    return rows;
  }

  /**
   * Streams the workbook into `out` (the HTTP response): books are read 1 000 at a time and each
   * row is committed right away, so memory stays flat however many books there are.
   */
  async write(opts: ExportOptions, out: Writable): Promise<number> {
    const fields = resolveFields(opts.fields);
    if (!fields.length) throw new BadRequestException('Не выбрано ни одного поля');

    const ctx = await this.context();
    const where = this.where(opts);
    const summary = new ExportSummary(ctx, opts.tzOffset, opts.from, opts.to);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: out,
      useStyles: true,
      useSharedStrings: false,
    });
    workbook.creator = 'Jolly Book';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Товары', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = fields.map((f) => ({
      header: f.label,
      key: f.key,
      width: f.width ?? 14,
      style: f.numFmt ? { numFmt: f.numFmt } : {},
    }));
    styleHeader(sheet.getRow(1));
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };

    let total = 0;
    for (let offset = 0; ; offset += BATCH) {
      const rows = await this.batch(where, offset);
      for (const row of rows) {
        sheet.addRow(fields.map((f) => cell(f, row, ctx, opts.tzOffset))).commit();
        summary.add(row);
      }
      total += rows.length;
      if (rows.length < BATCH) break;
    }
    sheet.commit();

    for (const key of opts.sheets) {
      const def = EXPORT_SHEETS.find((s) => s.key === key);
      if (!def) continue;
      const table = summary.table(key);
      const ws = workbook.addWorksheet(table.name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = table.columns.map((c) => ({
        header: c.label,
        key: c.label,
        width: c.width,
        style: c.numFmt ? { numFmt: c.numFmt } : {},
      }));
      styleHeader(ws.getRow(1));
      // summary dates are already on the client's wall clock
      for (const r of table.rows) ws.addRow(r.map((v) => clean(v, 0))).commit();
      if (table.totals) styleTotal(ws.addRow(table.totals.map((v) => clean(v, 0)))).commit();
      ws.commit();
    }

    await workbook.commit();
    this.logger.log(`Excel export: ${total} books, ${fields.length} columns, sheets [${opts.sheets.join(',')}]`);
    return total;
  }
}

function cell(f: ExportField, row: ExportRow, ctx: ExportContext, tzOffset: number): CellValue {
  return clean(f.value(row, ctx), tzOffset);
}

function clean(v: CellValue, tzOffset: number): CellValue {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : toWallClock(v, tzOffset);
  if (typeof v === 'string') {
    const s = v.replace(XML_INVALID, '');
    return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}…` : s;
  }
  return v;
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
  row.commit();
}

function styleTotal(row: ExcelJS.Row): ExcelJS.Row {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
  return row;
}
