/**
 * Excel export: the columns an admin can pick (Settings → «Выгрузка в Excel»), grouped the way the
 * mobile screen shows them. One raw SQL row per book (`ExportRow`, see ExportService.query) is turned
 * into cells by each field's `value`.
 */

export interface ExportRow {
  id: string;
  sku: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  yearPublished: number | null;
  pageCount: number | null;
  printRun: number | null;
  language: string | null;
  coverType: string | null;
  paperType: string | null;
  condition: string | null;
  bookType: string | null;
  direction: string | null;
  price: string | number | null;
  priceReviewed: boolean | null;
  weightGross: string | number | null;
  weightNet: string | number | null;
  dimensions: { width?: number; height?: number; depth?: number } | null;
  annotation: string | null;
  hashtags: string | null; // simple-array: comma separated
  status: string;
  createdAt: Date;
  updatedAt: Date;
  publishedToOzon: Date | null;
  isCopy: boolean;
  isCopyMaster: boolean;
  copyGroupId: string | null;
  addedToLibraryAt: Date | null;
  videoCoverUrl: string | null;
  videoCoverSyncedAt: Date | null;
  richContentSyncedAt: Date | null;
  photoCount: number | string | null;
  photoUrls: string | null; // newline separated, display order

  boxNumber: string | null;
  boxDescription: string | null;

  operatorId: string | null;
  operatorName: string | null;
  operatorPhone: string | null;
  operatorEmail: string | null;
  operatorRole: string | null;
  operatorApproved: boolean | null;
  operatorRegisteredAt: Date | null;

  workSessionId: string | null;
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  sessionStatus: string | null;

  libraryOwnerName: string | null;

  ozonStoreId: string | null;
  ozonProductId: string | null;
  ozonTaskId: string | number | null;
  ozonStatus: string | null;
  ozonError: string | null;
  ozonSentAt: Date | null;
  ozonUpdatedAt: Date | null;

  /** ocr_results.extractedData.price: what the AI answered, before the price formula */
  aiPrice: unknown;
  ocrStatus: string | null;
  ocrError: string | null;
  ocrAt: Date | null;
}

export interface ExportContext {
  /** ozon store id → name; '' (no store recorded) → the active store */
  storeName(storeId: string | null): string;
}

export type CellValue = string | number | boolean | Date | null;

export interface ExportField {
  key: string;
  label: string;
  /** checked when the admin opens the screen the first time */
  default?: boolean;
  /** column width in characters */
  width?: number;
  /** number format for Excel (dates get one automatically) */
  numFmt?: string;
  value(row: ExportRow, ctx: ExportContext): CellValue;
}

export interface ExportGroup {
  id: string;
  title: string;
  fields: ExportField[];
}

export const BOOK_STATUS_LABELS: Record<string, string> = {
  pending_review: 'На проверке',
  pending_publication: 'Ожидает публикации',
  published: 'Опубликована',
  publication_failed: 'Ошибка публикации',
  archived: 'В архиве',
  in_library: 'В библиотеке',
};

export const OZON_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  importing: 'Загружается',
  imported: 'Загружена',
  published: 'Опубликована',
  failed: 'Ошибка',
  archived: 'В архиве',
};

const OCR_STATUS_LABELS: Record<string, string> = {
  pending: 'В очереди',
  processing: 'Обрабатывается',
  completed: 'Готово',
  failed: 'Ошибка',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  operator: 'Оператор',
};

const DATE_FMT = 'dd.mm.yyyy hh:mm';
const MONEY_FMT = '#,##0.00';

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The AI returns the price as a number or a string like "350", "1 200", "450.00 руб." */
export function aiPrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.replace(/[\s\u00a0]/g, '').replace(',', '.').match(/\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(v: string | null | undefined): string | null {
  return v === null || v === undefined || v === '' ? null : v;
}

function yesNo(v: boolean | null | undefined): string {
  return v ? 'Да' : 'Нет';
}

function label(map: Record<string, string>, v: string | null): string | null {
  if (!v) return null;
  return map[v] ?? v;
}

function hashtags(v: string | null): string | null {
  if (!v) return null;
  return v
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(' ');
}

function durationMinutes(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

const date = (pick: (r: ExportRow) => Date | null) => (r: ExportRow) => pick(r) ?? null;

export const EXPORT_GROUPS: ExportGroup[] = [
  {
    id: 'book',
    title: 'Товар',
    fields: [
      { key: 'sku', label: 'Артикул (SKU)', default: true, width: 16, value: (r) => r.sku },
      { key: 'title', label: 'Название', default: true, width: 40, value: (r) => r.title },
      { key: 'author', label: 'Автор', default: true, width: 28, value: (r) => text(r.author) },
      { key: 'isbn', label: 'ISBN', default: true, width: 20, value: (r) => text(r.isbn) },
      { key: 'publisher', label: 'Издательство', default: true, width: 24, value: (r) => text(r.publisher) },
      { key: 'yearPublished', label: 'Год издания', default: true, width: 10, value: (r) => r.yearPublished ?? null },
      { key: 'pageCount', label: 'Количество страниц', width: 10, value: (r) => r.pageCount ?? null },
      { key: 'printRun', label: 'Тираж', width: 10, value: (r) => r.printRun ?? null },
      { key: 'language', label: 'Язык', width: 12, value: (r) => text(r.language) },
      { key: 'coverType', label: 'Переплёт', width: 18, value: (r) => text(r.coverType) },
      { key: 'paperType', label: 'Бумага', width: 12, value: (r) => text(r.paperType) },
      { key: 'condition', label: 'Состояние', width: 12, value: (r) => text(r.condition) },
      { key: 'bookType', label: 'Тип книги', width: 16, value: (r) => text(r.bookType) },
      { key: 'direction', label: 'Направление', width: 16, value: (r) => text(r.direction) },
      { key: 'price', label: 'Цена, ₽', default: true, width: 12, numFmt: MONEY_FMT, value: (r) => num(r.price) },
      { key: 'aiPrice', label: 'Цена от ИИ (до формулы), ₽', width: 12, numFmt: MONEY_FMT, value: (r) => aiPrice(r.aiPrice) },
      { key: 'priceReviewed', label: 'Цена проверена', width: 10, value: (r) => yesNo(r.priceReviewed) },
      { key: 'weightGross', label: 'Вес брутто, г', width: 10, value: (r) => num(r.weightGross) },
      { key: 'weightNet', label: 'Вес нетто, г', width: 10, value: (r) => num(r.weightNet) },
      { key: 'width', label: 'Ширина, мм', width: 10, value: (r) => num(r.dimensions?.width ?? null) },
      { key: 'height', label: 'Высота, мм', width: 10, value: (r) => num(r.dimensions?.height ?? null) },
      { key: 'depth', label: 'Толщина, мм', width: 10, value: (r) => num(r.dimensions?.depth ?? null) },
      { key: 'annotation', label: 'Аннотация', width: 60, value: (r) => text(r.annotation) },
      { key: 'hashtags', label: 'Хэштеги', width: 40, value: (r) => hashtags(r.hashtags) },
      { key: 'status', label: 'Статус карточки', default: true, width: 18, value: (r) => label(BOOK_STATUS_LABELS, r.status) },
      { key: 'photoCount', label: 'Количество фото', width: 10, value: (r) => num(r.photoCount) ?? 0 },
      { key: 'photoUrls', label: 'Ссылки на фото', width: 60, value: (r) => text(r.photoUrls) },
      { key: 'createdAt', label: 'Дата создания карточки', default: true, width: 17, numFmt: DATE_FMT, value: date((r) => r.createdAt) },
      { key: 'updatedAt', label: 'Дата последнего изменения', width: 17, numFmt: DATE_FMT, value: date((r) => r.updatedAt) },
      { key: 'bookId', label: 'ID карточки', width: 38, value: (r) => r.id },
    ],
  },
  {
    id: 'ozon',
    title: 'Ozon и магазины',
    fields: [
      { key: 'store', label: 'Магазин', default: true, width: 22, value: (r, ctx) => (r.ozonStatus ? ctx.storeName(r.ozonStoreId) : null) },
      { key: 'publishedToOzon', label: 'Дата публикации на Ozon', default: true, width: 17, numFmt: DATE_FMT, value: date((r) => r.publishedToOzon) },
      { key: 'ozonStatus', label: 'Статус на Ozon', default: true, width: 16, value: (r) => label(OZON_STATUS_LABELS, r.ozonStatus) },
      { key: 'ozonProductId', label: 'ID товара на Ozon', width: 14, value: (r) => text(r.ozonProductId) },
      { key: 'ozonSentAt', label: 'Первая отправка на Ozon', width: 17, numFmt: DATE_FMT, value: date((r) => r.ozonSentAt) },
      { key: 'ozonUpdatedAt', label: 'Последнее обновление на Ozon', width: 17, numFmt: DATE_FMT, value: date((r) => r.ozonUpdatedAt) },
      { key: 'ozonTaskId', label: 'ID задачи импорта', width: 14, value: (r) => (r.ozonTaskId == null ? null : String(r.ozonTaskId)) },
      { key: 'ozonError', label: 'Ошибка Ozon', width: 40, value: (r) => text(r.ozonError) },
      { key: 'videoCover', label: 'Видеообложка', width: 40, value: (r) => text(r.videoCoverUrl) },
      { key: 'videoCoverSyncedAt', label: 'Видеообложка отправлена', width: 17, numFmt: DATE_FMT, value: date((r) => r.videoCoverSyncedAt) },
      { key: 'richContentSyncedAt', label: 'Rich-контент отправлен', width: 17, numFmt: DATE_FMT, value: date((r) => r.richContentSyncedAt) },
    ],
  },
  {
    id: 'operator',
    title: 'Оператор и работа',
    fields: [
      { key: 'operatorName', label: 'Оператор (ФИО)', default: true, width: 26, value: (r) => text(r.operatorName) },
      { key: 'operatorPhone', label: 'Телефон оператора', width: 16, value: (r) => text(r.operatorPhone) },
      { key: 'operatorEmail', label: 'Email оператора', width: 26, value: (r) => text(r.operatorEmail) },
      { key: 'operatorRole', label: 'Роль', width: 16, value: (r) => label(ROLE_LABELS, r.operatorRole) },
      { key: 'operatorApproved', label: 'Аккаунт подтверждён', width: 10, value: (r) => (r.operatorId ? yesNo(r.operatorApproved) : null) },
      { key: 'operatorRegisteredAt', label: 'Дата регистрации оператора', width: 17, numFmt: DATE_FMT, value: date((r) => r.operatorRegisteredAt) },
      { key: 'boxNumber', label: 'Коробка', default: true, width: 10, value: (r) => text(r.boxNumber) },
      { key: 'boxDescription', label: 'Описание коробки', width: 24, value: (r) => text(r.boxDescription) },
      { key: 'sessionStartedAt', label: 'Рабочая сессия: начало', width: 17, numFmt: DATE_FMT, value: date((r) => r.sessionStartedAt) },
      { key: 'sessionEndedAt', label: 'Рабочая сессия: конец', width: 17, numFmt: DATE_FMT, value: date((r) => r.sessionEndedAt) },
      { key: 'sessionMinutes', label: 'Длительность сессии, мин', width: 10, value: (r) => durationMinutes(r.sessionStartedAt, r.sessionEndedAt) },
    ],
  },
  {
    id: 'copies',
    title: 'Копии и библиотека',
    fields: [
      { key: 'isCopy', label: 'Копия', width: 8, value: (r) => yesNo(r.isCopy) },
      { key: 'isCopyMaster', label: 'Основная копия', width: 8, value: (r) => (r.isCopy ? yesNo(r.isCopyMaster) : null) },
      { key: 'copyGroupId', label: 'ID набора копий', width: 38, value: (r) => text(r.copyGroupId) },
      { key: 'libraryOwner', label: 'В библиотеке у', width: 24, value: (r) => text(r.libraryOwnerName) },
      { key: 'addedToLibraryAt', label: 'Добавлена в библиотеку', width: 17, numFmt: DATE_FMT, value: date((r) => r.addedToLibraryAt) },
    ],
  },
  {
    id: 'ocr',
    title: 'Распознавание (ИИ)',
    fields: [
      { key: 'ocrStatus', label: 'Статус распознавания', width: 14, value: (r) => label(OCR_STATUS_LABELS, r.ocrStatus) },
      { key: 'ocrAt', label: 'Дата распознавания', width: 17, numFmt: DATE_FMT, value: date((r) => r.ocrAt) },
      { key: 'ocrError', label: 'Ошибка распознавания', width: 40, value: (r) => text(r.ocrError) },
    ],
  },
];

/** Extra sheets with totals, built from the same rows */
export const EXPORT_SHEETS = [
  { key: 'operators', label: 'Лист «Сводка по операторам»', default: true },
  { key: 'stores', label: 'Лист «Сводка по магазинам»', default: true },
  { key: 'days', label: 'Лист «По дням»', default: false },
] as const;

export type ExportSheetKey = (typeof EXPORT_SHEETS)[number]['key'];

const FIELD_BY_KEY = new Map<string, ExportField>(
  EXPORT_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f] as const)),
);

/** Picked keys → fields in the screen's order; unknown keys are dropped */
export function resolveFields(keys: string[]): ExportField[] {
  const wanted = new Set(keys);
  return EXPORT_GROUPS.flatMap((g) => g.fields).filter((f) => wanted.has(f.key));
}

export function isExportField(key: string): boolean {
  return FIELD_BY_KEY.has(key);
}

/** What GET /admin/export/fields returns: no value functions */
export function describeExport() {
  return {
    groups: EXPORT_GROUPS.map((g) => ({
      id: g.id,
      title: g.title,
      fields: g.fields.map((f) => ({ key: f.key, label: f.label, default: !!f.default })),
    })),
    sheets: EXPORT_SHEETS.map((s) => ({ key: s.key, label: s.label, default: s.default })),
  };
}

/**
 * The client's wall clock: Excel has no time zones, so dates are shifted by the phone's UTC offset
 * (`Date.getTimezoneOffset()`, minutes, negative east of UTC) and then written as if they were UTC.
 */
export function toWallClock(d: Date, tzOffsetMinutes: number): Date {
  return new Date(d.getTime() - tzOffsetMinutes * 60000);
}
