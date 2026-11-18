/**
 * Hashtag selection rules (Настройки → «Правила хэштегов»).
 *
 * Applied to the AI's hashtags right after extraction (the card keeps the result)
 * and once more when a book is published to Ozon. Stored as one JSON setting.
 */

export const HASHTAG_RULES_KEY = 'hashtag_rules';
export const HASHTAG_RULE_TYPES = ['forbid', 'replace', 'add'] as const;
export type HashtagRuleType = (typeof HASHTAG_RULE_TYPES)[number];

/** Ozon: up to 30 hashtags, each up to 30 characters including '#' */
export const MAX_HASHTAGS = 30;
export const MAX_HASHTAG_LENGTH = 30;
export const MAX_HASHTAG_RULES = 500;

export interface HashtagRule {
  id: string;
  type: HashtagRuleType;
  enabled: boolean;
  /** forbid: word fragment; replace: tag to find; add: tag to add */
  value: string;
  /** replace only: the tag put instead */
  replacement?: string | null;
  /** add only: add only to books published in [yearFrom, yearTo] (either end optional) */
  yearFrom?: number | null;
  yearTo?: number | null;
}

export interface HashtagContext {
  yearPublished?: number | null;
}

/** The list hard-coded before the rules became editable */
export const DEFAULT_HASHTAG_RULES: HashtagRule[] = [
  'полити', 'выбор', 'война', 'нарко', 'оруж', 'терро', 'экстрем', 'власт', 'идеолог',
].map((value) => ({ id: `default-${value}`, type: 'forbid', enabled: true, value }));

/** Comparison key: lowercase, ё→е, spaces→_, letters/digits/_ only, no '#' */
export function hashtagKey(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, '_')
    .replace(/[^a-zа-я0-9_]/g, '');
}

/** '#word_word' or null if nothing usable is left / too long for Ozon */
export function formatHashtag(raw: string): string | null {
  const body = String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, '');
  const tag = `#${body}`;
  if (body.length < 1 || tag.length > MAX_HASHTAG_LENGTH) return null;
  return tag;
}

function yearMatches(rule: HashtagRule, year: number | null | undefined): boolean {
  if (rule.yearFrom == null && rule.yearTo == null) return true;
  if (!year) return false;
  if (rule.yearFrom != null && year < rule.yearFrom) return false;
  if (rule.yearTo != null && year > rule.yearTo) return false;
  return true;
}

/**
 * Order: format → replace → forbid → mandatory tags first → dedupe → limit 30.
 * Mandatory tags are not checked against forbid rules (the admin chose them).
 */
export function applyHashtagRules(
  tags: string[] | null | undefined,
  rules: HashtagRule[],
  ctx: HashtagContext = {},
): string[] {
  const active = rules.filter((r) => r.enabled);

  const replacements = new Map<string, string>();
  for (const r of active) {
    if (r.type !== 'replace') continue;
    const from = hashtagKey(r.value);
    const to = formatHashtag(r.replacement ?? '');
    if (from && to && !replacements.has(from)) replacements.set(from, to);
  }

  const fragments = active
    .filter((r) => r.type === 'forbid')
    .map((r) => hashtagKey(r.value))
    .filter(Boolean);

  const mandatory = active
    .filter((r) => r.type === 'add' && yearMatches(r, ctx.yearPublished))
    .map((r) => formatHashtag(r.value))
    .filter((t): t is string => !!t);

  const fromAi = (tags ?? [])
    .map((t) => formatHashtag(t))
    .filter((t): t is string => !!t)
    .map((t) => replacements.get(hashtagKey(t)) ?? t)
    .filter((t) => {
      const key = hashtagKey(t);
      return !fragments.some((f) => key.includes(f));
    });

  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of [...mandatory, ...fromAi]) {
    const key = hashtagKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(t);
    if (result.length >= MAX_HASHTAGS) break;
  }
  return result;
}

/** Human-readable problem with a rule, or null if it is fine */
export function hashtagRuleError(rule: HashtagRule): string | null {
  if (!HASHTAG_RULE_TYPES.includes(rule.type)) return 'неизвестный тип правила';
  if (rule.type === 'forbid') {
    if (hashtagKey(rule.value).length < 2) return 'фрагмент должен содержать хотя бы 2 буквы или цифры';
    return null;
  }
  if (!formatHashtag(rule.value)) {
    return `«${rule.value}»: хэштег пустой или длиннее ${MAX_HASHTAG_LENGTH - 1} символов`;
  }
  if (rule.type === 'replace') {
    if (!formatHashtag(rule.replacement ?? '')) {
      return `«${rule.replacement ?? ''}»: замена пустая или длиннее ${MAX_HASHTAG_LENGTH - 1} символов`;
    }
    if (hashtagKey(rule.value) === hashtagKey(rule.replacement ?? '')) return 'тег заменяется сам на себя';
  }
  if (rule.type === 'add' && rule.yearFrom != null && rule.yearTo != null && rule.yearFrom > rule.yearTo) {
    return 'год «с» больше года «по»';
  }
  return null;
}
