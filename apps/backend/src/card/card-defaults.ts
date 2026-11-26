import {
  CoverType,
  PaperType,
  DEFAULT_WEIGHT_G,
  DEFAULT_LANGUAGE,
  DEFAULT_CONDITION,
  DEFAULT_BOOK_TYPE,
  DEFAULT_DIRECTION,
} from '@bookscanner/shared';

/**
 * Card defaults — values a book card gets when the AI (or the operator) gave none.
 * They are written into `books` like any value, and the field's name goes to
 * `books."defaultedFields"`, so a placeholder can be told from a real value and
 * re-applied when the admin changes the setting. Marketplace-independent: the Ozon
 * payload (`ozon/payload`) only maps the finished card.
 */
export const CARD_DEFAULTS_KEY = 'card_defaults';

export interface CardDefaults {
  weightG: number;
  /** dimensions.width */
  widthMm: number;
  /** dimensions.height — the book's length (Ozon «длина») */
  lengthMm: number;
  /** dimensions.depth — the book's thickness */
  thicknessMm: number;
  paperType: PaperType;
  coverType: CoverType;
  language: string;
  condition: string;
  bookType: string;
  direction: string;
}

export const DEFAULT_CARD_DEFAULTS: CardDefaults = {
  weightG: DEFAULT_WEIGHT_G,
  widthMm: 100,
  lengthMm: 100,
  thicknessMm: 35,
  paperType: PaperType.OFFSET,
  coverType: CoverType.HARDCOVER,
  language: DEFAULT_LANGUAGE,
  condition: DEFAULT_CONDITION,
  bookType: DEFAULT_BOOK_TYPE,
  direction: DEFAULT_DIRECTION,
};

/** Names stored in `defaultedFields`; width/height/depth are the axes of `dimensions`. */
export const DEFAULTABLE_FIELDS = [
  'weightGross',
  'width',
  'height',
  'depth',
  'paperType',
  'coverType',
  'language',
  'condition',
  'bookType',
  'direction',
] as const;
export type DefaultableField = (typeof DEFAULTABLE_FIELDS)[number];

export const DIMENSION_AXES = ['width', 'height', 'depth'] as const;
export type DimensionAxis = (typeof DIMENSION_AXES)[number];

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

/** The card fields that can get a default. */
export interface CardDefaultableValues {
  weightGross?: number | null;
  dimensions?: Partial<Dimensions> | null;
  paperType?: PaperType | null;
  coverType?: CoverType | null;
  language?: string | null;
  condition?: string | null;
  bookType?: string | null;
  direction?: string | null;
}

const TEXT_FIELDS = ['language', 'condition', 'bookType', 'direction'] as const;

/** The default for one field — what `apply` writes (dimensions: the axis number). */
export function defaultValue(field: DefaultableField, d: CardDefaults): string | number {
  switch (field) {
    case 'weightGross':
      return d.weightG;
    case 'width':
      return d.widthMm;
    case 'height':
      return d.lengthMm;
    case 'depth':
      return d.thicknessMm;
    default:
      return d[field];
  }
}

function isEmptyNumber(v: unknown): boolean {
  return v == null || !(Number(v) > 0);
}

function isEmptyText(v: unknown): boolean {
  return v == null || String(v).trim() === '';
}

/** Every defaultable field, filled. */
export interface FilledCardValues {
  weightGross: number;
  dimensions: Dimensions;
  paperType: PaperType;
  coverType: CoverType;
  language: string;
  condition: string;
  bookType: string;
  direction: string;
}

/**
 * Fills the empty fields with the defaults. Numbers ≤ 0 count as empty (the AI sends 0
 * for «unknown»). Returns every field complete and the names of the filled ones.
 */
export function fillDefaults(
  values: CardDefaultableValues,
  d: CardDefaults,
): { values: FilledCardValues; defaulted: DefaultableField[] } {
  const defaulted: DefaultableField[] = [];

  const weightGross = isEmptyNumber(values.weightGross)
    ? (defaulted.push('weightGross'), d.weightG)
    : Number(values.weightGross);

  const raw = values.dimensions ?? {};
  const dimensions = {} as Dimensions;
  for (const axis of DIMENSION_AXES) {
    if (isEmptyNumber(raw[axis])) {
      defaulted.push(axis);
      dimensions[axis] = defaultValue(axis, d) as number;
    } else {
      dimensions[axis] = Number(raw[axis]);
    }
  }

  const paperType = values.paperType || (defaulted.push('paperType'), d.paperType);
  const coverType = values.coverType || (defaulted.push('coverType'), d.coverType);

  const text = {} as Record<(typeof TEXT_FIELDS)[number], string>;
  for (const f of TEXT_FIELDS) {
    if (isEmptyText(values[f])) {
      defaulted.push(f);
      text[f] = d[f];
    } else {
      text[f] = String(values[f]);
    }
  }

  return {
    values: { weightGross, dimensions, paperType, coverType, ...text },
    defaulted,
  };
}

/**
 * Fields whose value changed between the stored card and an edit — a hand-edited field
 * is no longer a placeholder. Only changes count: old app builds send every field of the
 * form, unchanged ones included.
 */
export function changedDefaultableFields(
  before: CardDefaultableValues,
  edit: CardDefaultableValues,
): DefaultableField[] {
  const changed: DefaultableField[] = [];
  if (edit.weightGross !== undefined && Number(edit.weightGross ?? 0) !== Number(before.weightGross ?? 0)) {
    changed.push('weightGross');
  }
  if (edit.dimensions !== undefined) {
    for (const axis of DIMENSION_AXES) {
      const a = Number(before.dimensions?.[axis] ?? 0);
      const b = Number(edit.dimensions?.[axis] ?? 0);
      if (a !== b) changed.push(axis);
    }
  }
  for (const f of ['paperType', 'coverType', ...TEXT_FIELDS] as const) {
    if (edit[f] !== undefined && String(edit[f] ?? '') !== String(before[f] ?? '')) changed.push(f);
  }
  return changed;
}

const PAPER_TYPES = Object.values(PaperType) as string[];
const COVER_TYPES = Object.values(CoverType) as string[];

/** Why the defaults can't be saved, or null. */
export function cardDefaultsError(d: CardDefaults): string | null {
  const positive: Array<[keyof CardDefaults, string]> = [
    ['weightG', 'Вес'],
    ['widthMm', 'Ширина'],
    ['lengthMm', 'Длина'],
    ['thicknessMm', 'Толщина'],
  ];
  for (const [key, label] of positive) {
    const v = d[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return `${label}: нужно число больше 0`;
    if (v > 100_000) return `${label}: слишком большое число`;
  }
  if (!PAPER_TYPES.includes(d.paperType)) return 'Неизвестный тип бумаги';
  if (!COVER_TYPES.includes(d.coverType)) return 'Неизвестный тип обложки';
  const texts: Array<[keyof CardDefaults, string]> = [
    ['language', 'Язык'],
    ['condition', 'Сохранность'],
    ['bookType', 'Тип книги'],
    ['direction', 'Направление'],
  ];
  for (const [key, label] of texts) {
    const v = d[key];
    if (typeof v !== 'string' || !v.trim()) return `${label}: не может быть пустым`;
    if (v.length > 100) return `${label}: не длиннее 100 символов`;
  }
  return null;
}

/** A saved value merged over the standard one (a setting saved before a field existed). */
export function withStandard(saved: Partial<CardDefaults> | null | undefined): CardDefaults {
  return { ...DEFAULT_CARD_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}
