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
  | { kind: 'builtin'; builtin: OzonBuiltin };

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
}

export interface OzonCategoryRule {
  label: string;
  /** inclusive; null — no bound. A book without a year counts as year 0. */
  yearFrom: number | null;
  yearTo: number | null;
  descriptionCategoryId: number;
  typeId: number;
}

export interface OzonPayloadConfig {
  /** the first matching rule wins; none matches — the first one */
  categories: OzonCategoryRule[];
  vat: string;
  maxImages: number;
  annotation: { prefix: string; stripLinks: boolean };
  attributes: OzonAttrRule[];
}

const field = (f: OzonCardField): OzonAttrSource => ({ kind: 'field', field: f });
const builtin = (b: OzonBuiltin): OzonAttrSource => ({ kind: 'builtin', builtin: b });

export const DEFAULT_OZON_PAYLOAD_CONFIG: OzonPayloadConfig = {
  categories: [
    {
      label: 'Букинистические издания (до 2010)',
      yearFrom: null,
      yearTo: 2010,
      descriptionCategoryId: OZON_DESCRIPTION_CATEGORY_ID,
      typeId: OZON_TYPE_ID,
    },
    {
      label: 'Современные издания (с 2011)',
      yearFrom: 2011,
      yearTo: null,
      descriptionCategoryId: OZON_MODERN_DESCRIPTION_CATEGORY_ID,
      typeId: OZON_MODERN_TYPE_ID,
    },
  ],
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

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** Why the config can't be saved, or null. Messages name the attribute's position (1-based). */
export function ozonPayloadConfigError(c: OzonPayloadConfig): string | null {
  if (!Array.isArray(c.categories) || c.categories.length === 0) return 'Нужна хотя бы одна категория';
  for (const [i, cat] of c.categories.entries()) {
    const n = `Категория ${i + 1}`;
    if (!cat.label?.trim()) return `${n}: нет названия`;
    if (!isPositiveInt(cat.descriptionCategoryId) || !isPositiveInt(cat.typeId)) return `${n}: ID категории и типа — целые числа`;
    for (const y of [cat.yearFrom, cat.yearTo]) {
      if (y != null && (!Number.isInteger(y) || y < 0 || y > 3000)) return `${n}: неверный год`;
    }
    if (cat.yearFrom != null && cat.yearTo != null && cat.yearFrom > cat.yearTo) return `${n}: «с» больше «по»`;
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
    const s = a.source;
    if (!s) return `${n}: не указан источник`;
    if (s.kind === 'field') {
      if (!(s.field in OZON_CARD_FIELDS)) return `${n}: неизвестное поле карточки`;
    } else if (s.kind === 'const') {
      if (typeof s.value !== 'string' || !s.value.trim()) return `${n}: пустое значение`;
      if (s.value.length > 5000) return `${n}: значение длиннее 5000 символов`;
      if (s.dictionaryValueId != null && !isPositiveInt(s.dictionaryValueId)) return `${n}: ID значения словаря — целое число`;
    } else if (s.kind === 'builtin') {
      if (!(s.builtin in OZON_BUILTINS)) return `${n}: неизвестная встроенная логика`;
    } else {
      return `${n}: неизвестный источник`;
    }
    if (a.valueMap) {
      if (!Array.isArray(a.valueMap) || a.valueMap.length > MAX_VALUE_MAP) return `${n}: не больше ${MAX_VALUE_MAP} замен`;
      for (const [j, m] of a.valueMap.entries()) {
        if (!m.from?.trim() || typeof m.to !== 'string') return `${n}, замена ${j + 1}: пустое значение`;
        if (m.dictionaryValueId != null && !isPositiveInt(m.dictionaryValueId)) return `${n}, замена ${j + 1}: ID словаря — целое число`;
      }
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

/** A saved config, or the standard one when it is missing or broken. */
export function configOrStandard(saved: unknown): OzonPayloadConfig {
  if (!saved || typeof saved !== 'object') return DEFAULT_OZON_PAYLOAD_CONFIG;
  const c = { ...DEFAULT_OZON_PAYLOAD_CONFIG, ...(saved as Partial<OzonPayloadConfig>) };
  return ozonPayloadConfigError(c) ? DEFAULT_OZON_PAYLOAD_CONFIG : c;
}
