import api from './api';
import type { CoverType, PaperType } from '../types';

/** Card defaults (server `card/card-defaults.ts`): what an empty field of a card gets. */
export interface CardDefaults {
  weightG: number;
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
  paperType: PaperType;
  coverType: CoverType;
  language: string;
  condition: string;
  bookType: string;
  direction: string;
}

/** Names in `Book.defaultedFields` → field label in the app */
export const DEFAULTED_FIELD_LABELS: Record<string, string> = {
  weightGross: 'Вес',
  width: 'Ширина',
  height: 'Длина',
  depth: 'Толщина',
  paperType: 'Тип бумаги',
  coverType: 'Тип обложки',
  language: 'Язык',
  condition: 'Сохранность',
  bookType: 'Тип книги',
  direction: 'Направление',
};

// ─── Ozon payload config (server `ozon/payload/ozon-payload-config.ts`) ───

export type OzonAttrSource =
  | { kind: 'field'; field: string }
  | { kind: 'const'; value: string; dictionaryValueId?: number | null }
  /** a value from the attribute's Ozon dictionary */
  | { kind: 'dictionary'; value: string; dictionaryValueId: number }
  | { kind: 'builtin'; builtin: string };

/** What a matched condition does */
export type OzonCondAction = OzonAttrSource | { kind: 'skip' };

export type OzonCondOperand =
  | { kind: 'field'; field: string }
  | { kind: 'attr'; attrId: number }
  /** the Ozon category chosen for the book (compared by its name); attributes' conditions only */
  | { kind: 'category' };

export interface OzonCondCheck {
  operand: OzonCondOperand;
  /** eq, ne, lt, lte, gt, gte, contains, notContains, empty, notEmpty */
  op: string;
  value?: string;
}

export interface OzonAttrCondition {
  checks: OzonCondCheck[];
  action: OzonCondAction;
}

export const OZON_UNARY_OPS = ['empty', 'notEmpty'];

export interface OzonValueMapEntry {
  from: string;
  to: string;
  dictionaryValueId?: number | null;
}

export interface OzonAttrRule {
  key: string;
  id: number;
  label: string;
  enabled: boolean;
  system?: boolean;
  source: OzonAttrSource;
  valueMap?: OzonValueMapEntry[];
  skipIfEmpty: boolean;
  /** checked top-down; the first match decides, none — the source */
  conditions?: OzonAttrCondition[];
}

/** A leaf of Ozon's category tree: category + product type */
export interface OzonCategoryValue {
  /** «Книги › Букинистические издания (1942-2010 гг.) › Печатная книга» */
  label: string;
  descriptionCategoryId: number;
  typeId: number;
}

export interface OzonCategoryCondition {
  checks: OzonCondCheck[];
  category: OzonCategoryValue;
}

/** The book's Ozon category: the first matching condition, else `default` */
export interface OzonCategoryConfig {
  default: OzonCategoryValue;
  conditions?: OzonCategoryCondition[];
}

export interface OzonPayloadConfig {
  category: OzonCategoryConfig;
  vat: string;
  maxImages: number;
  annotation: { prefix: string; stripLinks: boolean };
  attributes: OzonAttrRule[];
}

export interface OzonPayloadConfigResponse {
  config: OzonPayloadConfig;
  standard: OzonPayloadConfig;
  /** card field → label */
  fields: Record<string, string>;
  /** built-in logic → description */
  builtins: Record<string, string>;
  /** condition operator → sign */
  ops: Record<string, string>;
}

export interface OzonPayloadPreview {
  bookId: string;
  sku: string;
  title: string;
  payload: { items: Array<Record<string, unknown>> };
  rows: Array<{ id: number; label: string; value: string; note?: string }>;
  warnings: string[];
  /** attributes left out by a condition */
  notes?: string[];
  /** the chosen category and why («по умолчанию» / «условие N») */
  category?: OzonCategoryValue & { note: string };
  defaultedFields: string[];
}

/** An attribute from Ozon's catalogue, merged over the categories of the payload config */
export interface OzonCatalogAttribute {
  id: number;
  name: string;
  description: string;
  type: string;
  isRequired: boolean;
  isCollection: boolean;
  /** 0 — free text, otherwise a value from the dictionary */
  dictionaryId: number;
  groupName: string;
  /** part of a complex attribute — can't be sent from this screen */
  complex: boolean;
  categories: string[];
  requiredIn: string[];
  /** key of the attribute in our config that already sends it */
  usedBy: string | null;
}

export interface OzonDictionaryValue {
  id: number;
  value: string;
  info?: string;
}

export const cardPipelineService = {
  /** Search Ozon's category tree (every word; empty — the «Книги» branch), up to 100 */
  async searchOzonCategories(q: string): Promise<{ categories: OzonCategoryValue[]; total: number }> {
    const { data } = await api.get('/ozon/payload-config/ozon-categories', { params: { q } });
    return data;
  },

  async getOzonAttributes(): Promise<{ categories: string[]; attributes: OzonCatalogAttribute[] }> {
    const { data } = await api.get('/ozon/payload-config/ozon-attributes');
    return data;
  },

  /** Dictionary values (search from 2 characters; empty query — the first page) */
  async searchOzonValues(
    attributeId: number,
    q: string,
  ): Promise<{ values: OzonDictionaryValue[]; hasNext: boolean; category: string }> {
    const { data } = await api.get(`/ozon/payload-config/ozon-attributes/${attributeId}/values`, {
      params: { q },
    });
    return data;
  },

  async getCardDefaults(): Promise<{ defaults: CardDefaults; standard: CardDefaults }> {
    const { data } = await api.get('/admin/settings/card-defaults');
    return data;
  },

  async saveCardDefaults(defaults: CardDefaults): Promise<CardDefaults> {
    const { data } = await api.put<{ defaults: CardDefaults }>('/admin/settings/card-defaults', defaults);
    return data.defaults;
  },

  /** Unpublished cards whose placeholder fields differ from the current defaults */
  async countStaleCards(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/admin/settings/card-defaults/apply');
    return data.count;
  },

  async applyCardDefaults(): Promise<number> {
    const { data } = await api.post<{ updated: number }>('/admin/settings/card-defaults/apply');
    return data.updated;
  },

  async getOzonPayloadConfig(): Promise<OzonPayloadConfigResponse> {
    const { data } = await api.get<OzonPayloadConfigResponse>('/ozon/payload-config');
    return data;
  },

  /** Replaces the whole config; the server answers 400 with «Атрибут N: …» */
  async saveOzonPayloadConfig(config: OzonPayloadConfig): Promise<OzonPayloadConfig> {
    const { data } = await api.put<{ config: OzonPayloadConfig }>('/ozon/payload-config', { config });
    return data.config;
  },

  /** What would go to Ozon for a book now (with an unsaved draft config, if given) */
  async previewOzonPayload(q: { bookId?: string; sku?: string; config?: OzonPayloadConfig }): Promise<OzonPayloadPreview> {
    const { data } = await api.post<OzonPayloadPreview>('/ozon/payload-config/preview', q);
    return data;
  },
};

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

/**
 * A config from a server older than the category row (2026-11-26) has year ranges in `categories`
 * instead of `category` — converted the way the server does it (categoryFromLegacy), so the
 * screen never sees a config without a category.
 */
export function withCategory(raw: OzonPayloadConfig): OzonPayloadConfig {
  const c = raw as OzonPayloadConfig & {
    categories?: Array<{ label: string; yearFrom: number | null; yearTo: number | null; descriptionCategoryId: number; typeId: number }>;
  };
  if (c.category?.default || !Array.isArray(c.categories) || c.categories.length === 0) return raw;
  const rules = c.categories;
  const value = (r: (typeof rules)[0]): OzonCategoryValue => ({
    label: r.label,
    descriptionCategoryId: r.descriptionCategoryId,
    typeId: r.typeId,
  });
  const year = { kind: 'field' as const, field: 'yearPublished' };
  const conditions: OzonCategoryCondition[] = [];
  let fallback = rules[0];
  for (const r of rules) {
    const checks: OzonCondCheck[] = [];
    if (r.yearFrom != null) checks.push({ operand: year, op: 'gte', value: String(r.yearFrom) });
    if (r.yearTo != null) checks.push({ operand: year, op: 'lte', value: String(r.yearTo) });
    if (checks.length === 0) {
      fallback = r;
      break;
    }
    conditions.push({ checks, category: value(r) });
  }
  const zero = rules.find((r) => (r.yearFrom == null || r.yearFrom <= 0) && (r.yearTo == null || r.yearTo >= 0));
  if (zero && zero !== fallback) conditions.unshift({ checks: [{ operand: year, op: 'empty' }], category: value(zero) });
  const { categories: _old, ...rest } = c;
  return { ...rest, category: { default: value(fallback), ...(conditions.length ? { conditions } : {}) } };
}
