import {
  ANNOTATION_PREFIX,
  OZON_DESCRIPTION_CATEGORY_ID,
  OZON_TYPE_ID,
  OZON_MODERN_DESCRIPTION_CATEGORY_ID,
  OZON_MODERN_TYPE_ID,
  OZON_ATTR_NAME,
  OZON_ATTR_AUTHOR_COVER,
  OZON_ATTR_BRAND,
  OZON_ATTR_TYPE,
  OZON_ATTR_DIRECTION,
  OZON_ATTR_AUTHOR,
  OZON_ATTR_ISBN,
  OZON_ATTR_PUBLISHER,
  OZON_ATTR_YEAR,
  OZON_ATTR_COVER_TYPE,
  OZON_ATTR_PAPER_TYPE,
  OZON_ATTR_PAGE_COUNT,
  OZON_ATTR_LANGUAGE,
  OZON_ATTR_CONDITION,
  OZON_ATTR_ANNOTATION,
  OZON_ATTR_BOOK_TYPE,
  OZON_ATTR_DIMENSIONS,
  OZON_ATTR_WEIGHT,
  OZON_ATTR_HASHTAGS,
  OZON_ATTR_TNVED,
  OZON_TNVED_BOOKS_VALUE_ID,
} from '@bookscanner/shared';
import { OZON_ATTR_RICH_CONTENT } from '../rich-content/rich-content.builder';

/**
 * How a finished card becomes an Ozon import item (setting `ozon_payload_config`).
 * `DEFAULT_OZON_PAYLOAD_CONFIG` reproduces the payload the code built before the setting
 * existed — `ozon-payload.builder.spec.ts` checks that against recorded payloads.
 */
export const OZON_PAYLOAD_CONFIG_KEY = 'ozon_payload_config';

/** Card fields an attribute can take its value from. */
export const OZON_CARD_FIELDS = {
  title: 'Название',
  author: 'Автор',
  isbn: 'ISBN',
  publisher: 'Издательство',
  yearPublished: 'Год издания',
  coverType: 'Тип обложки',
  paperType: 'Тип бумаги',
  pageCount: 'Количество страниц',
  printRun: 'Тираж',
  language: 'Язык',
  condition: 'Сохранность',
  bookType: 'Тип книги',
  direction: 'Направление',
  weightGross: 'Вес, г (округлённый)',
} as const;
export type OzonCardField = keyof typeof OZON_CARD_FIELDS;

/** Values that need code: dictionary lookups, joins, generated content. */
export const OZON_BUILTINS = {
  brand: 'Бренд по словарю Ozon (из издательства, иначе «Нет бренда»)',
  publisher: 'Издательство по словарю Ozon (не найдено — не отправляется)',
  authors: 'Авторы по словарю Ozon (только найденные)',
  authorCover: 'Все авторы через «;» (имена из словаря, если найдены)',
  annotation: 'Аннотация: префикс + текст без ссылок',
  hashtags: 'Хэштеги после правил хэштегов, через пробел',
  richContent: 'Rich-контент (если включён для магазина)',
  dimensions: 'Размеры «Д x Ш x В», мм',
} as const;
export type OzonBuiltin = keyof typeof OZON_BUILTINS;

export type OzonAttrSource =
  | { kind: 'field'; field: OzonCardField }
  | { kind: 'const'; value: string; dictionaryValueId?: number | null }
  /** a value picked from the attribute's Ozon dictionary (text + its id) */
  | { kind: 'dictionary'; value: string; dictionaryValueId: number }
  | { kind: 'builtin'; builtin: OzonBuiltin };

/** What a matched condition does: take the value from a source, or leave the attribute out */
export type OzonCondAction = OzonAttrSource | { kind: 'skip' };

export const OZON_COND_OPS = {
  eq: '=',
  ne: '≠',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  contains: 'содержит',
  notContains: 'не содержит',
  empty: 'пусто',
  notEmpty: 'не пусто',
} as const;
export type OzonCondOp = keyof typeof OZON_COND_OPS;
/** operators that need no value */
export const OZON_UNARY_OPS: OzonCondOp[] = ['empty', 'notEmpty'];

/**
 * What a check looks at: a card field (after the card defaults), another attribute's value
 * as it would be sent — source + replacements, but before that attribute's own conditions
 * (so attributes may depend on each other without loops and their order does not matter) —
 * or, in an attribute's condition, the Ozon category chosen for the book (its label).
 */
export type OzonCondOperand =
  | { kind: 'field'; field: OzonCardField }
  | { kind: 'attr'; attrId: number }
  | { kind: 'category' };

export interface OzonCondCheck {
  operand: OzonCondOperand;
  op: OzonCondOp;
  value?: string;
}

/** «If every check holds → action». The first matching condition of an attribute wins. */
export interface OzonAttrCondition {
  checks: OzonCondCheck[];
  action: OzonCondAction;
}

export interface OzonValueMapEntry {
  from: string;
  to: string;
  dictionaryValueId?: number | null;
}

export interface OzonAttrRule {
  /** stable key (system attributes keep theirs) */
  key: string;
  id: number;
  label: string;
  enabled: boolean;
  /** required by Ozon or by our flow — can be edited, not deleted or switched off */
  system?: boolean;
  source: OzonAttrSource;
  /** whole-value replacements, case-insensitive (e.g. «мягкий переплет» → «Мягкая обложка») */
  valueMap?: OzonValueMapEntry[];
  /** true — an empty value is not sent; false — sent as "" */
  skipIfEmpty: boolean;
  /** checked top-down before the source; none matches — the source as usual */
  conditions?: OzonAttrCondition[];
}

/** An Ozon category + product type (a leaf of /v1/description-category/tree) */
export interface OzonCategoryValue {
  /** the path in Ozon's tree, e.g. «Книги › Букинистические издания (1942-2010 гг.) › Печатная книга» */
  label: string;
  descriptionCategoryId: number;
  typeId: number;
}

export interface OzonCategoryCondition {
  checks: OzonCondCheck[];
  category: OzonCategoryValue;
}

/**
 * The book's Ozon category: chosen first (attributes, required ones and dictionaries depend on
 * it). Conditions — top-down, the first match wins — may look at card fields and at attributes'
 * base values; none matches — `default`.
 */
export interface OzonCategoryConfig {
  default: OzonCategoryValue;
  conditions?: OzonCategoryCondition[];
}

/** Before 2026-11-26 the category was picked by year ranges («Категории по году») */
export interface LegacyOzonCategoryRule {
  label: string;
  /** inclusive; null — no bound. A book without a year counted as year 0. */
  yearFrom: number | null;
  yearTo: number | null;
  descriptionCategoryId: number;
  typeId: number;
}

export interface OzonPayloadConfig {
  category: OzonCategoryConfig;
  vat: string;
  maxImages: number;
  annotation: { prefix: string; stripLinks: boolean };
  attributes: OzonAttrRule[];
}

const field = (f: OzonCardField): OzonAttrSource => ({ kind: 'field', field: f });
const builtin = (b: OzonBuiltin): OzonAttrSource => ({ kind: 'builtin', builtin: b });

export const DEFAULT_OZON_PAYLOAD_CONFIG: OzonPayloadConfig = {
  category: {
    // a book without a year stays here, as before
    default: {
      label: 'Книги › Букинистические издания (1942-2010 гг.) › Печатная книга',
      descriptionCategoryId: OZON_DESCRIPTION_CATEGORY_ID,
      typeId: OZON_TYPE_ID,
    },
    conditions: [
      {
        checks: [{ operand: { kind: 'field', field: 'yearPublished' }, op: 'gte', value: '2011' }],
        category: {
          label: 'Книги › Современные печатные издания (с 2011 г.) › Печатная книга',
          descriptionCategoryId: OZON_MODERN_DESCRIPTION_CATEGORY_ID,
          typeId: OZON_MODERN_TYPE_ID,
        },
      },
    ],
  },
  vat: '0',
  maxImages: 30,
  annotation: { prefix: ANNOTATION_PREFIX, stripLinks: true },
  attributes: [
    { key: 'name', id: OZON_ATTR_NAME, label: 'Название', enabled: true, system: true, source: field('title'), skipIfEmpty: false },
    { key: 'authorCover', id: OZON_ATTR_AUTHOR_COVER, label: 'Автор на обложке', enabled: true, system: true, source: builtin('authorCover'), skipIfEmpty: false },
    { key: 'brand', id: OZON_ATTR_BRAND, label: 'Бренд', enabled: true, system: true, source: builtin('brand'), skipIfEmpty: false },
    { key: 'type', id: OZON_ATTR_TYPE, label: 'Тип', enabled: true, system: true, source: field('bookType'), skipIfEmpty: false },
    { key: 'direction', id: OZON_ATTR_DIRECTION, label: 'Направление', enabled: true, system: true, source: field('direction'), skipIfEmpty: false },
    {
      key: 'tnved',
      id: OZON_ATTR_TNVED,
      label: 'ТН ВЭД',
      enabled: true,
      system: true,
      source: {
        kind: 'const',
        value: '4901990000 - Прочие книги, брошюры, листовки, аналогичные печатные издания, сброшюрованные',
        dictionaryValueId: OZON_TNVED_BOOKS_VALUE_ID,
      },
      skipIfEmpty: false,
    },
    { key: 'authors', id: OZON_ATTR_AUTHOR, label: 'Автор', enabled: true, source: builtin('authors'), skipIfEmpty: true },
    { key: 'isbn', id: OZON_ATTR_ISBN, label: 'ISBN', enabled: true, source: field('isbn'), skipIfEmpty: true },
    { key: 'publisher', id: OZON_ATTR_PUBLISHER, label: 'Издательство', enabled: true, source: builtin('publisher'), skipIfEmpty: true },
    { key: 'year', id: OZON_ATTR_YEAR, label: 'Год выпуска', enabled: true, source: field('yearPublished'), skipIfEmpty: true },
    {
      key: 'coverType',
      id: OZON_ATTR_COVER_TYPE,
      label: 'Тип обложки',
      enabled: true,
      source: field('coverType'),
      valueMap: [
        { from: 'мягкий переплет', to: 'Мягкая обложка' },
        { from: 'твердый переплет', to: 'Твердый переплет' },
      ],
      skipIfEmpty: true,
    },
    {
      key: 'paperType',
      id: OZON_ATTR_PAPER_TYPE,
      label: 'Тип бумаги',
      enabled: true,
      source: field('paperType'),
      valueMap: [
        { from: 'офсетная', to: 'Офсетная' },
        { from: 'глянцевая', to: 'Мелованная глянцевая' },
        { from: 'матовая', to: 'Мелованная матовая' },
      ],
      skipIfEmpty: true,
    },
    { key: 'pageCount', id: OZON_ATTR_PAGE_COUNT, label: 'Количество страниц', enabled: true, source: field('pageCount'), skipIfEmpty: true },
    { key: 'language', id: OZON_ATTR_LANGUAGE, label: 'Язык издания', enabled: true, source: field('language'), skipIfEmpty: true },
    { key: 'condition', id: OZON_ATTR_CONDITION, label: 'Сохранность книги', enabled: true, source: field('condition'), skipIfEmpty: true },
    { key: 'annotation', id: OZON_ATTR_ANNOTATION, label: 'Аннотация', enabled: true, source: builtin('annotation'), skipIfEmpty: false },
    { key: 'bookType', id: OZON_ATTR_BOOK_TYPE, label: 'Тип книги', enabled: true, source: field('bookType'), skipIfEmpty: false },
    { key: 'dimensions', id: OZON_ATTR_DIMENSIONS, label: 'Размеры, мм', enabled: true, source: builtin('dimensions'), skipIfEmpty: false },
    { key: 'weight', id: OZON_ATTR_WEIGHT, label: 'Вес товара, г', enabled: true, source: field('weightGross'), skipIfEmpty: false },
    { key: 'hashtags', id: OZON_ATTR_HASHTAGS, label: '#Хештеги', enabled: true, source: builtin('hashtags'), skipIfEmpty: true },
    { key: 'richContent', id: OZON_ATTR_RICH_CONTENT, label: 'Rich-контент JSON', enabled: true, source: builtin('richContent'), skipIfEmpty: true },
  ],
};

/** Keys that must stay in the list and stay on. */
export const SYSTEM_ATTR_KEYS = DEFAULT_OZON_PAYLOAD_CONFIG.attributes.filter((a) => a.system).map((a) => a.key);

export const MAX_OZON_ATTRIBUTES = 80;
const MAX_VALUE_MAP = 100;
const MAX_CONDITIONS = 30;
const MAX_CHECKS = 10;

/** Why a source (of an attribute or of a condition's action) is invalid, or null. */
function sourceError(s: OzonCondAction | undefined, allowSkip: boolean): string | null {
  if (!s) return 'не указан источник';
  switch (s.kind) {
    case 'skip':
      return allowSkip ? null : 'неизвестный источник';
    case 'field':
      return s.field in OZON_CARD_FIELDS ? null : 'неизвестное поле карточки';
    case 'const':
      if (typeof s.value !== 'string' || !s.value.trim()) return 'пустое значение';
      if (s.value.length > 5000) return 'значение длиннее 5000 символов';
      if (s.dictionaryValueId != null && !isPositiveInt(s.dictionaryValueId)) return 'ID значения словаря — целое число';
      return null;
    case 'dictionary':
      if (typeof s.value !== 'string' || !s.value.trim()) return 'не выбрано значение из словаря';
      return isPositiveInt(s.dictionaryValueId) ? null : 'нет ID значения словаря';
    case 'builtin':
      return s.builtin in OZON_BUILTINS ? null : 'неизвестная встроенная логика';
    default:
      return 'неизвестный источник';
  }
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function categoryValueError(v: OzonCategoryValue | undefined): string | null {
  if (!v) return 'не выбрана категория';
  if (!v.label?.trim() || v.label.length > 300) return 'нет названия категории';
  if (!isPositiveInt(v.descriptionCategoryId) || !isPositiveInt(v.typeId)) return 'ID категории и типа — целые числа';
  return null;
}

/** Why the checks of a condition are invalid, or null. `self` — the attribute that owns them. */
function checksError(
  checks: OzonCondCheck[] | undefined,
  attrIds: Set<number>,
  opts: { self?: number; allowCategory: boolean },
): string | null {
  if (!Array.isArray(checks) || checks.length === 0) return 'нет ни одной проверки';
  if (checks.length > MAX_CHECKS) return `не больше ${MAX_CHECKS} проверок`;
  for (const ch of checks) {
    const o = ch.operand;
    if (o?.kind === 'field') {
      if (!(o.field in OZON_CARD_FIELDS)) return 'неизвестное поле карточки';
    } else if (o?.kind === 'attr') {
      if (!attrIds.has(o.attrId)) return `атрибута ${o.attrId} нет в списке`;
      if (o.attrId === opts.self) return 'условие не может проверять сам атрибут';
    } else if (o?.kind === 'category') {
      if (!opts.allowCategory) return 'категория не может зависеть от самой себя';
    } else {
      return 'не выбрано, что проверять';
    }
    if (!(ch.op in OZON_COND_OPS)) return 'неизвестное сравнение';
    if (!OZON_UNARY_OPS.includes(ch.op) && (typeof ch.value !== 'string' || !ch.value.trim())) {
      return 'не указано, с чем сравнивать';
    }
    if (typeof ch.value === 'string' && ch.value.length > 500) return 'значение длиннее 500 символов';
  }
  return null;
}

/** Every category the config can choose (default first), without repeats */
export function configCategories(c: OzonPayloadConfig): OzonCategoryValue[] {
  const all = [c.category.default, ...(c.category.conditions ?? []).map((x) => x.category)];
  const seen = new Set<string>();
  return all.filter((v) => {
    const k = `${v.descriptionCategoryId}:${v.typeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Why the config can't be saved, or null. Messages name the attribute's position (1-based). */
export function ozonPayloadConfigError(c: OzonPayloadConfig): string | null {
  if (!c.category || typeof c.category !== 'object') return 'Не задана категория Ozon';
  const defErr = categoryValueError(c.category.default);
  if (defErr) return `Категория по умолчанию: ${defErr}`;
  const allAttrIds = new Set((Array.isArray(c.attributes) ? c.attributes : []).map((a) => a.id));
  if (c.category.conditions != null) {
    if (!Array.isArray(c.category.conditions) || c.category.conditions.length > MAX_CONDITIONS) {
      return `Категория: не больше ${MAX_CONDITIONS} условий`;
    }
    for (const [j, cond] of c.category.conditions.entries()) {
      const n = `Категория, условие ${j + 1}`;
      const chErr = checksError(cond.checks, allAttrIds, { allowCategory: false });
      if (chErr) return `${n}: ${chErr}`;
      const vErr = categoryValueError(cond.category);
      if (vErr) return `${n}: ${vErr}`;
    }
  }
  if (typeof c.vat !== 'string' || !/^(0|0\.\d+|1)$/.test(c.vat)) return 'НДС: 0, 0.05, 0.1, 0.2 и т. п.';
  if (!isPositiveInt(c.maxImages) || c.maxImages > 30) return 'Фото: от 1 до 30';
  if (typeof c.annotation?.prefix !== 'string' || c.annotation.prefix.length > 1000) return 'Префикс аннотации: не длиннее 1000 символов';

  if (!Array.isArray(c.attributes) || c.attributes.length > MAX_OZON_ATTRIBUTES) {
    return `Не больше ${MAX_OZON_ATTRIBUTES} атрибутов`;
  }
  const ids = new Set<number>();
  const keys = new Set<string>();
  for (const [i, a] of c.attributes.entries()) {
    const n = `Атрибут ${i + 1}`;
    if (!a.key?.trim()) return `${n}: нет ключа`;
    if (keys.has(a.key)) return `${n}: повторяющийся ключ`;
    keys.add(a.key);
    if (!isPositiveInt(a.id)) return `${n}: ID — целое число больше 0`;
    if (ids.has(a.id)) return `${n}: ID ${a.id} уже есть в списке`;
    ids.add(a.id);
    if (!a.label?.trim() || a.label.length > 100) return `${n}: название от 1 до 100 символов`;
    const srcErr = sourceError(a.source, false);
    if (srcErr) return `${n}: ${srcErr}`;
    if (a.valueMap) {
      if (!Array.isArray(a.valueMap) || a.valueMap.length > MAX_VALUE_MAP) return `${n}: не больше ${MAX_VALUE_MAP} замен`;
      for (const [j, m] of a.valueMap.entries()) {
        if (!m.from?.trim() || typeof m.to !== 'string') return `${n}, замена ${j + 1}: пустое значение`;
        if (m.dictionaryValueId != null && !isPositiveInt(m.dictionaryValueId)) return `${n}, замена ${j + 1}: ID словаря — целое число`;
      }
    }
  }
  const attrIds = new Set(c.attributes.map((a) => a.id));
  for (const [i, a] of c.attributes.entries()) {
    if (a.conditions == null) continue;
    if (!Array.isArray(a.conditions) || a.conditions.length > MAX_CONDITIONS) {
      return `Атрибут ${i + 1}: не больше ${MAX_CONDITIONS} условий`;
    }
    for (const [j, cond] of a.conditions.entries()) {
      const n = `Атрибут ${i + 1} «${a.label}», условие ${j + 1}`;
      const chErr = checksError(cond.checks, attrIds, { self: a.id, allowCategory: true });
      if (chErr) return `${n}: ${chErr}`;
      const actErr = sourceError(cond.action, true);
      if (actErr) return `${n}: ${actErr}`;
      if (a.system && cond.action.kind === 'skip') return `${n}: обязательный атрибут нельзя не отправлять`;
    }
  }

  for (const key of SYSTEM_ATTR_KEYS) {
    const a = c.attributes.find((x) => x.key === key);
    const std = DEFAULT_OZON_PAYLOAD_CONFIG.attributes.find((x) => x.key === key)!;
    if (!a) return `Обязательный атрибут «${std.label}» нельзя удалить`;
    if (!a.enabled) return `Обязательный атрибут «${std.label}» нельзя выключить`;
  }
  return null;
}

/**
 * The old year ranges as a category with conditions. Old rule: the first range that holds the
 * year (a book without a year = year 0), none — the first range.
 */
export function categoryFromLegacy(rules: LegacyOzonCategoryRule[]): OzonCategoryConfig {
  const value = (r: LegacyOzonCategoryRule): OzonCategoryValue => ({
    label: r.label,
    descriptionCategoryId: r.descriptionCategoryId,
    typeId: r.typeId,
  });
  const year = { kind: 'field' as const, field: 'yearPublished' as const };
  const conditions: OzonCategoryCondition[] = [];
  let fallback = rules[0];
  for (const r of rules) {
    const checks: OzonCondCheck[] = [];
    if (r.yearFrom != null) checks.push({ operand: year, op: 'gte', value: String(r.yearFrom) });
    if (r.yearTo != null) checks.push({ operand: year, op: 'lte', value: String(r.yearTo) });
    if (checks.length === 0) {
      fallback = r; // matches every year — later ranges were never reached
      break;
    }
    conditions.push({ checks, category: value(r) });
  }
  // a book without a year went to the first range holding year 0
  const zero = rules.find((r) => (r.yearFrom == null || r.yearFrom <= 0) && (r.yearTo == null || r.yearTo >= 0));
  if (zero && zero !== fallback) {
    conditions.unshift({ checks: [{ operand: year, op: 'empty' }], category: value(zero) });
  }
  return { default: value(fallback), ...(conditions.length && { conditions }) };
}

/** Converts a config saved with «Категории по году» (or sent by such an app) */
export function upgradeConfig(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const c = input as Record<string, unknown>;
  if (c.category || !Array.isArray(c.categories) || c.categories.length === 0) return input;
  const { categories, ...rest } = c;
  return { ...rest, category: categoryFromLegacy(categories as LegacyOzonCategoryRule[]) };
}

/** A saved config, or the standard one when it is missing or broken. */
export function configOrStandard(saved: unknown): OzonPayloadConfig {
  saved = upgradeConfig(saved);
  if (!saved || typeof saved !== 'object') return DEFAULT_OZON_PAYLOAD_CONFIG;
  const c = { ...DEFAULT_OZON_PAYLOAD_CONFIG, ...(saved as Partial<OzonPayloadConfig>) };
  return ozonPayloadConfigError(c) ? DEFAULT_OZON_PAYLOAD_CONFIG : c;
}
