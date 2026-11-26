import type { CellValue, ExportContext, ExportRow, ExportSheetKey } from './export-fields';
import { toWallClock } from './export-fields';

export interface SummaryTable {
  name: string;
  columns: { label: string; width: number; numFmt?: string }[];
  rows: CellValue[][];
  totals?: CellValue[];
}

const DATE_FMT = 'dd.mm.yyyy hh:mm';
const DAY_FMT = 'dd.mm.yyyy';
const MONEY_FMT = '#,##0.00';

interface OperatorAcc {
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  cards: number;
  published: number;
  pending: number;
  failed: number;
  archived: number;
  library: number;
  publishedSum: number;
  sessions: Set<string>;
  first: Date | null;
  last: Date | null;
}

interface StoreAcc {
  name: string;
  sent: number;
  published: number;
  active: number;
  archived: number;
  failed: number;
  activeSum: number;
  first: Date | null;
  last: Date | null;
}

interface DayAcc {
  created: number;
  published: number;
  operators: Set<string>;
}

const NOT_SENT = '— не отправлялись на Ozon —';

function price(v: string | number | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Totals for the extra sheets, collected while the book rows stream by. Dates in the returned
 * tables are already on the client's wall clock (see toWallClock).
 */
export class ExportSummary {
  private readonly operators = new Map<string, OperatorAcc>();
  private readonly stores = new Map<string, StoreAcc>();
  private readonly days = new Map<string, DayAcc>();

  constructor(
    private readonly ctx: ExportContext,
    private readonly tzOffset: number,
    private readonly from?: Date,
    private readonly to?: Date,
  ) {}

  private inPeriod(d: Date | null): d is Date {
    if (!d) return false;
    if (this.from && d < this.from) return false;
    if (this.to && d >= this.to) return false;
    return true;
  }

  private day(d: Date): DayAcc {
    const key = toWallClock(d, this.tzOffset).toISOString().slice(0, 10);
    let acc = this.days.get(key);
    if (!acc) {
      acc = { created: 0, published: 0, operators: new Set() };
      this.days.set(key, acc);
    }
    return acc;
  }

  add(r: ExportRow): void {
    const isPublished = r.status === 'published';
    const wasPublished = !!r.publishedToOzon;

    const opKey = r.operatorId ?? '';
    let op = this.operators.get(opKey);
    if (!op) {
      op = {
        name: r.operatorName ?? 'Удалённый пользователь',
        phone: r.operatorPhone,
        email: r.operatorEmail,
        role: r.operatorRole,
        cards: 0,
        published: 0,
        pending: 0,
        failed: 0,
        archived: 0,
        library: 0,
        publishedSum: 0,
        sessions: new Set(),
        first: null,
        last: null,
      };
      this.operators.set(opKey, op);
    }
    op.cards++;
    if (wasPublished) op.published++;
    if (r.status === 'pending_review' || r.status === 'pending_publication') op.pending++;
    if (r.status === 'publication_failed') op.failed++;
    if (r.status === 'archived') op.archived++;
    if (r.status === 'in_library') op.library++;
    if (isPublished) op.publishedSum += price(r.price);
    if (r.workSessionId) op.sessions.add(r.workSessionId);
    op.first = minDate(op.first, r.createdAt);
    op.last = maxDate(op.last, r.createdAt);

    const storeKey = r.ozonStatus ? this.ctx.storeName(r.ozonStoreId) : NOT_SENT;
    let st = this.stores.get(storeKey);
    if (!st) {
      st = { name: storeKey, sent: 0, published: 0, active: 0, archived: 0, failed: 0, activeSum: 0, first: null, last: null };
      this.stores.set(storeKey, st);
    }
    st.sent++;
    if (wasPublished) st.published++;
    if (isPublished) {
      st.active++;
      st.activeSum += price(r.price);
    }
    if (r.status === 'archived') st.archived++;
    if (r.status === 'publication_failed') st.failed++;
    st.first = minDate(st.first, r.publishedToOzon);
    st.last = maxDate(st.last, r.publishedToOzon);

    if (this.inPeriod(r.createdAt)) {
      const d = this.day(r.createdAt);
      d.created++;
      if (r.operatorId) d.operators.add(r.operatorId);
    }
    if (this.inPeriod(r.publishedToOzon)) this.day(r.publishedToOzon).published++;
  }

  private wall(d: Date | null): Date | null {
    return d ? toWallClock(d, this.tzOffset) : null;
  }

  table(key: ExportSheetKey): SummaryTable {
    if (key === 'operators') return this.operatorsTable();
    if (key === 'stores') return this.storesTable();
    return this.daysTable();
  }

  private operatorsTable(): SummaryTable {
    const ops = [...this.operators.values()].sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name, 'ru'));
    const sum = (pick: (o: OperatorAcc) => number) => ops.reduce((s, o) => s + pick(o), 0);
    return {
      name: 'Операторы',
      columns: [
        { label: 'Оператор', width: 28 },
        { label: 'Телефон', width: 16 },
        { label: 'Email', width: 26 },
        { label: 'Роль', width: 16 },
        { label: 'Карточек создано', width: 12 },
        { label: 'Опубликовано на Ozon', width: 12 },
        { label: 'На проверке / ждут публикации', width: 14 },
        { label: 'Ошибки публикации', width: 12 },
        { label: 'В архиве', width: 10 },
        { label: 'В библиотеке', width: 10 },
        { label: 'Сумма цен в продаже, ₽', width: 14, numFmt: MONEY_FMT },
        { label: 'Рабочих сессий', width: 10 },
        { label: 'Первая карточка', width: 17, numFmt: DATE_FMT },
        { label: 'Последняя карточка', width: 17, numFmt: DATE_FMT },
      ],
      rows: ops.map((o) => [
        o.name,
        o.phone,
        o.email,
        o.role === 'admin' ? 'Администратор' : o.role === 'operator' ? 'Оператор' : o.role,
        o.cards,
        o.published,
        o.pending,
        o.failed,
        o.archived,
        o.library,
        o.publishedSum,
        o.sessions.size,
        this.wall(o.first),
        this.wall(o.last),
      ]),
      totals: [
        'Итого',
        null,
        null,
        null,
        sum((o) => o.cards),
        sum((o) => o.published),
        sum((o) => o.pending),
        sum((o) => o.failed),
        sum((o) => o.archived),
        sum((o) => o.library),
        sum((o) => o.publishedSum),
        sum((o) => o.sessions.size),
        null,
        null,
      ],
    };
  }

  private storesTable(): SummaryTable {
    const stores = [...this.stores.values()].sort((a, b) => {
      if (a.name === NOT_SENT) return 1;
      if (b.name === NOT_SENT) return -1;
      return b.sent - a.sent || a.name.localeCompare(b.name, 'ru');
    });
    const sum = (pick: (s: StoreAcc) => number) => stores.reduce((acc, s) => acc + pick(s), 0);
    return {
      name: 'Магазины',
      columns: [
        { label: 'Магазин', width: 30 },
        { label: 'Карточек', width: 10 },
        { label: 'Опубликовано на Ozon', width: 12 },
        { label: 'Сейчас в продаже', width: 12 },
        { label: 'В архиве', width: 10 },
        { label: 'Ошибки публикации', width: 12 },
        { label: 'Сумма цен в продаже, ₽', width: 14, numFmt: MONEY_FMT },
        { label: 'Первая публикация', width: 17, numFmt: DATE_FMT },
        { label: 'Последняя публикация', width: 17, numFmt: DATE_FMT },
      ],
      rows: stores.map((s) => [
        s.name,
        s.sent,
        s.published,
        s.active,
        s.archived,
        s.failed,
        s.activeSum,
        this.wall(s.first),
        this.wall(s.last),
      ]),
      totals: [
        'Итого',
        sum((s) => s.sent),
        sum((s) => s.published),
        sum((s) => s.active),
        sum((s) => s.archived),
        sum((s) => s.failed),
        sum((s) => s.activeSum),
        null,
        null,
      ],
    };
  }

  private daysTable(): SummaryTable {
    const keys = [...this.days.keys()].sort();
    const rows = keys.map((k) => {
      const d = this.days.get(k)!;
      return [new Date(`${k}T00:00:00Z`), d.created, d.published, d.operators.size] as CellValue[];
    });
    const all = [...this.days.values()];
    return {
      name: 'По дням',
      columns: [
        { label: 'Дата', width: 12, numFmt: DAY_FMT },
        { label: 'Создано карточек', width: 12 },
        { label: 'Опубликовано на Ozon', width: 12 },
        { label: 'Операторов работало', width: 12 },
      ],
      rows,
      totals: [
        'Итого',
        all.reduce((s, d) => s + d.created, 0),
        all.reduce((s, d) => s + d.published, 0),
        null,
      ],
    };
  }
}
