import { PassThrough } from 'stream';
import * as ExcelJS from 'exceljs';
import { ExportService } from './export.service';
import { aiPrice, describeExport, EXPORT_GROUPS, ExportRow } from './export-fields';

function row(over: Partial<ExportRow>): ExportRow {
  return {
    id: 'b1',
    sku: '12_ABC',
    title: 'Мастер и Маргарита',
    author: 'Булгаков М. А.',
    isbn: '978-5-17-090630-7',
    publisher: 'АСТ',
    yearPublished: 1989,
    pageCount: 384,
    printRun: 100000,
    language: 'русский',
    coverType: 'твердый переплет',
    paperType: 'офсетная',
    condition: 'Хорошая',
    bookType: 'Печатная книга',
    direction: 'проза',
    price: '450.00',
    priceReviewed: true,
    weightGross: '450.00',
    weightNet: '420.00',
    dimensions: { width: 130, height: 200, depth: 35 },
    annotation: 'Текст\u0007 с управляющим символом',
    hashtags: '#роман,#классика',
    status: 'published',
    createdAt: new Date('2026-11-01T21:30:00Z'), // 02.11 00:30 in Moscow
    updatedAt: new Date('2026-11-02T10:00:00Z'),
    publishedToOzon: new Date('2026-11-03T09:00:00Z'),
    isCopy: false,
    isCopyMaster: false,
    copyGroupId: null,
    addedToLibraryAt: null,
    videoCoverUrl: null,
    videoCoverSyncedAt: null,
    richContentSyncedAt: null,
    photoCount: 2,
    photoUrls: 'https://x/1.jpg\nhttps://x/2.jpg',
    boxNumber: '12',
    boxDescription: null,
    operatorId: 'u1',
    operatorName: 'Иванова Анна',
    operatorPhone: '+79990000000',
    operatorEmail: 'a@example.com',
    operatorRole: 'operator',
    operatorApproved: true,
    operatorRegisteredAt: new Date('2026-01-01T00:00:00Z'),
    workSessionId: 's1',
    sessionStartedAt: new Date('2026-11-01T20:00:00Z'),
    sessionEndedAt: new Date('2026-11-01T23:00:00Z'),
    sessionStatus: 'completed',
    libraryOwnerName: null,
    ozonStoreId: 'st1',
    ozonProductId: '123456',
    ozonTaskId: '987',
    ozonStatus: 'published',
    ozonError: null,
    ozonSentAt: new Date('2026-11-03T08:00:00Z'),
    ozonUpdatedAt: new Date('2026-11-03T09:00:00Z'),
    aiPrice: 50,
    ocrStatus: 'completed',
    ocrError: null,
    ocrAt: new Date('2026-11-01T21:31:00Z'),
    ...over,
  };
}

async function run(rows: ExportRow[], fields: string[], sheets: ('operators' | 'stores' | 'days')[]) {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('LIMIT')) return sql.includes('OFFSET 0') ? rows : [];
    return [];
  });
  const settings = {
    getValue: jest.fn(async (key: string, def: unknown) =>
      key === 'ozon_stores' ? [{ id: 'st1', name: 'Jolly White' }] : key === 'active_ozon_store_id' ? 'st1' : def,
    ),
  };
  const service = new ExportService({ query } as any, settings as any);
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c) => chunks.push(c));
  const done = new Promise((r) => out.on('end', r));
  const total = await service.write(
    { dateField: 'created', fields, sheets, tzOffset: -180, from: new Date('2026-10-31T21:00:00Z') },
    out,
  );
  await done;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.concat(chunks) as any);
  return { total, wb, query };
}

describe('ExportService', () => {
  it('field keys are unique', () => {
    const keys = EXPORT_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(describeExport().groups.map((g) => g.title)).toContain('Товар');
  });

  it('writes picked fields in screen order, local dates and summary sheets', async () => {
    const rows = [
      row({}),
      row({ id: 'b2', sku: '12_DEF', status: 'pending_review', publishedToOzon: null, ozonStatus: null, ozonStoreId: null, price: '300' }),
    ];
    const { total, wb, query } = await run(rows, ['operatorName', 'sku', 'createdAt', 'store', 'annotation', 'bogus'], [
      'operators',
      'stores',
      'days',
    ]);
    expect(total).toBe(2);
    expect(query.mock.calls[0][0]).toContain('b."createdAt" >= $1');

    const books = wb.getWorksheet('Товары')!;
    const header = (books.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(['Артикул (SKU)', 'Аннотация', 'Дата создания карточки', 'Магазин', 'Оператор (ФИО)']);
    const r1 = (books.getRow(2).values as unknown[]).slice(1);
    expect(r1[0]).toBe('12_ABC');
    expect(r1[1]).toBe('Текст с управляющим символом');
    expect((r1[2] as Date).toISOString()).toBe('2026-11-02T00:30:00.000Z');
    expect(r1[3]).toBe('Jolly White');
    expect(r1[4]).toBe('Иванова Анна');
    expect((books.getRow(3).values as unknown[])[4]).toBeUndefined(); // never sent → no store

    const ops = wb.getWorksheet('Операторы')!;
    const op = (ops.getRow(2).values as unknown[]).slice(1);
    expect(op[0]).toBe('Иванова Анна');
    expect(op[4]).toBe(2); // cards
    expect(op[5]).toBe(1); // published
    expect(op[6]).toBe(1); // pending
    expect(op[10]).toBe(450); // sum of prices on sale

    const stores = wb.getWorksheet('Магазины')!;
    expect((stores.getRow(2).values as unknown[])[1]).toBe('Jolly White');
    expect((stores.getRow(3).values as unknown[])[1]).toBe('— не отправлялись на Ozon —');

    const days = wb.getWorksheet('По дням')!;
    const d1 = (days.getRow(2).values as unknown[]).slice(1);
    expect((d1[0] as Date).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(d1[1]).toBe(2);
  });

  it('reads the AI price whatever shape it came in', () => {
    expect(aiPrice(50)).toBe(50);
    expect(aiPrice('1 200')).toBe(1200);
    expect(aiPrice('450,50 руб.')).toBe(450.5);
    expect(aiPrice('не найдено')).toBeNull();
    expect(aiPrice(0)).toBeNull();
    expect(aiPrice(null)).toBeNull();
  });

  it('refuses an export without fields', async () => {
    await expect(run([], ['bogus'], [])).rejects.toThrow('Не выбрано');
  });
});
