import { CoverType, PaperType } from '@bookscanner/shared';
import { buildOzonPayloadReport } from '../ozon-payload.builder';
import {
  DEFAULT_OZON_PAYLOAD_CONFIG,
  configOrStandard,
  ozonPayloadConfigError,
  type OzonPayloadConfig,
} from './ozon-payload-config';
import { DEFAULT_CARD_DEFAULTS } from '../../card/card-defaults';

const std = DEFAULT_OZON_PAYLOAD_CONFIG;
const clone = (): OzonPayloadConfig => JSON.parse(JSON.stringify(std));

const book = {
  sku: '1_A',
  title: 'Книга',
  author: 'Автор',
  yearPublished: 1990,
  dimensions: null,
  weightGross: null,
  paperType: PaperType.OFFSET,
  coverType: CoverType.SOFTCOVER,
  language: 'Русский',
  condition: 'Хорошая',
  bookType: null,
  direction: null,
  price: 900,
  annotation: 'Текст',
  hashtags: [],
  photos: [{ fileUrl: 'u1', sortOrder: 0 }],
} as any;

const attrs = (report: ReturnType<typeof buildOzonPayloadReport>) =>
  (report.payload.items as any[])[0].attributes as Array<{ id: number; values: Array<{ value: string; dictionary_value_id?: number }> }>;
const attr = (report: ReturnType<typeof buildOzonPayloadReport>, id: number) => attrs(report).find((a) => a.id === id);

describe('ozonPayloadConfigError', () => {
  it('accepts the standard config', () => {
    expect(ozonPayloadConfigError(std)).toBeNull();
  });

  it('keeps system attributes in place and on', () => {
    const c = clone();
    c.attributes = c.attributes.filter((a) => a.key !== 'tnved');
    expect(ozonPayloadConfigError(c)).toMatch(/ТН ВЭД/);
    const d = clone();
    d.attributes.find((a) => a.key === 'name')!.enabled = false;
    expect(ozonPayloadConfigError(d)).toMatch(/нельзя выключить/);
  });

  it('rejects duplicate ids, empty constants and bad categories', () => {
    const c = clone();
    c.attributes.push({ key: 'x', id: 4180, label: 'Дубль', enabled: true, source: { kind: 'const', value: '1' }, skipIfEmpty: true });
    expect(ozonPayloadConfigError(c)).toMatch(/4180/);
    const d = clone();
    d.attributes.push({ key: 'x', id: 99999, label: 'Пусто', enabled: true, source: { kind: 'const', value: ' ' }, skipIfEmpty: true });
    expect(ozonPayloadConfigError(d)).toMatch(/пустое значение/);
    expect(ozonPayloadConfigError({ ...clone(), categories: [] })).toMatch(/категория/);
    expect(ozonPayloadConfigError({ ...clone(), vat: '20%' })).toMatch(/НДС/);
  });

  it('falls back to the standard config when the saved one is broken', () => {
    expect(configOrStandard(null)).toBe(std);
    expect(configOrStandard({ categories: [] })).toBe(std);
    expect(configOrStandard({ vat: '0.2' }).vat).toBe('0.2');
  });
});

describe('buildOzonPayloadReport with a changed config', () => {
  it('uses card defaults for empty fields of an old card', () => {
    const r = buildOzonPayloadReport(book, {}, std, { ...DEFAULT_CARD_DEFAULTS, weightG: 400, direction: 'Поэзия' });
    const item = (r.payload.items as any[])[0];
    expect(item.weight).toBe(400);
    expect(attr(r, 23273)?.values[0].value).toBe('Поэзия');
  });

  it('adds a constant attribute, applies a changed value map, skips a disabled one', () => {
    const c = clone();
    c.attributes.push({ key: 'age', id: 9070, label: 'Возраст', enabled: true, source: { kind: 'const', value: '16+', dictionaryValueId: 42 }, skipIfEmpty: true });
    c.attributes.find((a) => a.key === 'coverType')!.valueMap = [{ from: 'МЯГКИЙ переплет', to: 'Обложка', dictionaryValueId: 7 }];
    c.attributes.find((a) => a.key === 'language')!.enabled = false;
    const r = buildOzonPayloadReport(book, {}, c, DEFAULT_CARD_DEFAULTS);
    expect(attr(r, 9070)?.values).toEqual([{ value: '16+', dictionary_value_id: 42 }]);
    expect(attr(r, 9356)?.values).toEqual([{ value: 'Обложка', dictionary_value_id: 7 }]);
    expect(attr(r, 4189)).toBeUndefined();
  });

  it('picks the category by year, VAT and the photo limit from the config', () => {
    const c = clone();
    c.categories = [{ label: 'Всё', yearFrom: null, yearTo: null, descriptionCategoryId: 5, typeId: 6 }];
    c.vat = '0.1';
    c.maxImages = 1;
    const r = buildOzonPayloadReport({ ...book, photos: [{ fileUrl: 'a', sortOrder: 0 }, { fileUrl: 'b', sortOrder: 1 }] }, {}, c, DEFAULT_CARD_DEFAULTS);
    const item = (r.payload.items as any[])[0];
    expect([item.description_category_id, item.type_id, item.vat, item.images]).toEqual([5, 6, '0.1', ['a']]);
  });

  it('adds the annotation prefix once and warns about empty attributes', () => {
    const c = clone();
    c.annotation = { prefix: 'Б/у. ', stripLinks: true };
    const r1 = buildOzonPayloadReport({ ...book, isbn: null }, {}, c, DEFAULT_CARD_DEFAULTS);
    expect(attr(r1, 4191)?.values[0].value).toBe('Б/у. Текст');
    expect(r1.warnings.some((w) => w.includes('ISBN'))).toBe(true);
    const r2 = buildOzonPayloadReport({ ...book, annotation: 'Б/у. Текст' }, {}, c, DEFAULT_CARD_DEFAULTS);
    expect(attr(r2, 4191)?.values[0].value).toBe('Б/у. Текст');
  });
});
