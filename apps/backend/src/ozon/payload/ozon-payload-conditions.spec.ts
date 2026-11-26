import { CoverType, PaperType } from '@bookscanner/shared';
import { buildOzonPayloadReport, checkHolds } from '../ozon-payload.builder';
import {
  DEFAULT_OZON_PAYLOAD_CONFIG,
  ozonPayloadConfigError,
  type OzonAttrCondition,
  type OzonPayloadConfig,
} from './ozon-payload-config';
import { DEFAULT_CARD_DEFAULTS } from '../../card/card-defaults';

const clone = (): OzonPayloadConfig => JSON.parse(JSON.stringify(DEFAULT_OZON_PAYLOAD_CONFIG));

const book = (over: Record<string, unknown> = {}) =>
  ({
    sku: '1_A',
    title: 'Книга',
    author: 'Автор',
    yearPublished: 1990,
    dimensions: { width: 120, height: 200, depth: 20 },
    weightGross: 300,
    paperType: PaperType.OFFSET,
    coverType: CoverType.SOFTCOVER,
    pageCount: 320,
    language: 'Русский',
    condition: 'Хорошая',
    bookType: 'Печатная книга',
    direction: 'Проза',
    price: 900,
    annotation: 'Текст',
    hashtags: [],
    photos: [{ fileUrl: 'u1', sortOrder: 0 }],
    ...over,
  }) as any;

const build = (c: OzonPayloadConfig, b = book()) => buildOzonPayloadReport(b, {}, c, DEFAULT_CARD_DEFAULTS);
const attr = (r: ReturnType<typeof build>, id: number) =>
  ((r.payload.items as any[])[0].attributes as any[]).find((a) => a.id === id);

function withConditions(key: string, conditions: OzonAttrCondition[]): OzonPayloadConfig {
  const c = clone();
  c.attributes.find((a) => a.key === key)!.conditions = conditions;
  return c;
}

describe('checkHolds', () => {
  const ch = (op: any, value?: string) => ({ operand: { kind: 'field' as const, field: 'yearPublished' as const }, op, value });
  it('compares numbers as numbers', () => {
    expect(checkHolds(ch('lte', '2011'), '1990')).toBe(true);
    expect(checkHolds(ch('lte', '2011'), '2011')).toBe(true);
    expect(checkHolds(ch('lt', '2011'), '2011')).toBe(false);
    expect(checkHolds(ch('gt', '100'), '99')).toBe(false);
    expect(checkHolds(ch('eq', '2011'), '2011.0')).toBe(true);
  });
  it('never matches <, > on empty or text', () => {
    expect(checkHolds(ch('lte', '2011'), null)).toBe(false);
    expect(checkHolds(ch('gte', '5'), 'много')).toBe(false);
  });
  it('compares text case-insensitively and checks emptiness', () => {
    expect(checkHolds(ch('eq', 'МЯГКИЙ переплет'), 'мягкий переплет')).toBe(true);
    expect(checkHolds(ch('contains', 'мягк'), 'Мягкая обложка')).toBe(true);
    expect(checkHolds(ch('notContains', 'мягк'), 'Твердый')).toBe(true);
    expect(checkHolds(ch('empty'), '  ')).toBe(true);
    expect(checkHolds(ch('notEmpty'), 'x')).toBe(true);
  });
});

describe('conditions in the payload', () => {
  it('sets a dictionary value by the year, otherwise keeps the source', () => {
    const c = withConditions('bookType', [
      {
        checks: [{ operand: { kind: 'field', field: 'yearPublished' }, op: 'lte', value: '2011' }],
        action: { kind: 'dictionary', value: 'Букинистическое издание', dictionaryValueId: 555 },
      },
    ]);
    const old = build(c);
    expect(attr(old, 9236).values).toEqual([{ value: 'Букинистическое издание', dictionary_value_id: 555 }]);
    expect(old.rows.find((r) => r.id === 9236)?.note).toBe('условие 1');
    const modern = build(c, book({ yearPublished: 2015 }));
    expect(attr(modern, 9236).values).toEqual([{ value: 'Печатная книга' }]);
  });

  it('looks at another attribute as it is sent (after its replacements)', () => {
    // «Тип обложки» = «Мягкая обложка» after the standard replacement
    const c = withConditions('condition', [
      {
        checks: [{ operand: { kind: 'attr', attrId: 9356 }, op: 'eq', value: 'Мягкая обложка' }],
        action: { kind: 'const', value: 'Удовлетворительная' },
      },
    ]);
    expect(attr(build(c), 8857).values).toEqual([{ value: 'Удовлетворительная' }]);
    expect(attr(build(c, book({ coverType: CoverType.HARDCOVER })), 8857).values).toEqual([{ value: 'Хорошая' }]);
  });

  it('leaves an attribute out, all checks must hold, the first match wins', () => {
    const c = withConditions('isbn', [
      {
        checks: [
          { operand: { kind: 'field', field: 'yearPublished' }, op: 'lt', value: '1970' },
          { operand: { kind: 'field', field: 'pageCount' }, op: 'gt', value: '100' },
        ],
        action: { kind: 'skip' },
      },
      {
        checks: [{ operand: { kind: 'field', field: 'yearPublished' }, op: 'lt', value: '1970' }],
        action: { kind: 'const', value: 'нет' },
      },
    ]);
    const r1 = build(c, book({ yearPublished: 1960, isbn: '978-5-1' }));
    expect(attr(r1, 4184)).toBeUndefined();
    expect(r1.notes[0]).toMatch(/ISBN.*условие 1/);
    const r2 = build(c, book({ yearPublished: 1960, pageCount: 50, isbn: '978-5-1' }));
    expect(attr(r2, 4184).values).toEqual([{ value: 'нет' }]);
    const r3 = build(c, book({ yearPublished: 1990, isbn: '978-5-1' }));
    expect(attr(r3, 4184).values).toEqual([{ value: '978-5-1' }]);
  });

  it('conditions see other attributes before their own conditions (no loops)', () => {
    const c = clone();
    c.attributes.find((a) => a.key === 'language')!.conditions = [
      { checks: [{ operand: { kind: 'attr', attrId: 8857 }, op: 'eq', value: 'Хорошая' }], action: { kind: 'const', value: 'A' } },
    ];
    c.attributes.find((a) => a.key === 'condition')!.conditions = [
      { checks: [{ operand: { kind: 'attr', attrId: 4189 }, op: 'eq', value: 'Русский' }], action: { kind: 'const', value: 'B' } },
    ];
    const r = build(c);
    expect(attr(r, 4189).values[0].value).toBe('A');
    expect(attr(r, 8857).values[0].value).toBe('B');
  });

  it('no conditions — the standard payload is unchanged', () => {
    expect(build(clone()).payload).toEqual(build(DEFAULT_OZON_PAYLOAD_CONFIG).payload);
  });
});

describe('ozonPayloadConfigError for conditions', () => {
  const cond = (over: Partial<OzonAttrCondition>): OzonAttrCondition => ({
    checks: [{ operand: { kind: 'field', field: 'yearPublished' }, op: 'lte', value: '2011' }],
    action: { kind: 'const', value: 'x' },
    ...over,
  });
  it('accepts a valid condition', () => {
    expect(ozonPayloadConfigError(withConditions('bookType', [cond({})]))).toBeNull();
  });
  it('rejects bad ones', () => {
    expect(ozonPayloadConfigError(withConditions('bookType', [cond({ checks: [] })]))).toMatch(/проверки/);
    expect(
      ozonPayloadConfigError(
        withConditions('bookType', [cond({ checks: [{ operand: { kind: 'field', field: 'yearPublished' }, op: 'lte' }] })]),
      ),
    ).toMatch(/с чем сравнивать/);
    expect(
      ozonPayloadConfigError(
        withConditions('bookType', [cond({ checks: [{ operand: { kind: 'attr', attrId: 123456 }, op: 'empty' }] })]),
      ),
    ).toMatch(/123456/);
    expect(
      ozonPayloadConfigError(
        withConditions('bookType', [cond({ checks: [{ operand: { kind: 'attr', attrId: 9236 }, op: 'empty' }] })]),
      ),
    ).toMatch(/сам атрибут/);
    expect(ozonPayloadConfigError(withConditions('name', [cond({ action: { kind: 'skip' } })]))).toMatch(/обязательный/);
    expect(
      ozonPayloadConfigError(withConditions('bookType', [cond({ action: { kind: 'dictionary', value: 'x' } as any })])),
    ).toMatch(/ID значения словаря/);
  });
});
