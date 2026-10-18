import { isValidIsbn } from '@bookscanner/shared';

// Shared by duplicate grouping (books.service), its probability check and the copy-set backfill
// migration, so all three agree on what "the same book" means.

// Lowercase + ё→е + Latin/Cyrillic homoglyphs + whitespace collapse.
// Intentionally does NOT strip punctuation from titles to avoid false-positive title collisions.
const HOMOGLYPHS: Record<string, string> = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };
export const normalizeTitle = (s?: string | null) =>
  (s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[acoepxy]/g, (ch) => HOMOGLYPHS[ch] ?? ch)
    .replace(/\s+/g, ' ')
    .trim();

// Returns the ISBN digits only when the checksum is valid. Placeholders like
// "978-5-0000-0000-0" and OCR junk like "501(13)-86" are treated as "no ISBN".
export const canonicalIsbn = (s?: string | null): string | null => {
  const cleaned = (s ?? '').replace(/[-\s]/g, '').toUpperCase();
  return cleaned && isValidIsbn(cleaned) ? cleaned : null;
};

// Name parts of an author field, in order: "Пушкин А.С." → ["пушкин", "а", "с"].
export const authorTokens = (s?: string | null): string[] =>
  normalizeTitle(s).split(/[\s,.;]+/).filter(Boolean);

// Every token of X maps to a distinct token of Y: identical, or — when one of them is at most
// 3 letters — a prefix of it (initial "л" ↔ "лев", abbreviation "арк" ↔ "аркадий"). At least
// one identical token of length ≥ 3 (the surname) is required, so a shared first name alone
// never links. Longer tokens are placed first so the surname claims its exact match.
function fitsInto(x: string[], y: string[]): boolean {
  const used = new Array<boolean>(y.length).fill(false);
  let anchor = false;
  for (const t of [...x].sort((a, b) => b.length - a.length)) {
    let k = y.findIndex((u, i) => !used[i] && u === t);
    if (k >= 0) {
      if (t.length >= 3) anchor = true;
    } else {
      k = y.findIndex(
        (u, i) => !used[i] && Math.min(t.length, u.length) <= 3 && (u.startsWith(t) || t.startsWith(u)),
      );
    }
    if (k < 0) return false;
    used[k] = true;
  }
  return anchor;
}

/**
 * Whether two author fields can name the same author(s): word order, initials and short
 * abbreviations are ignored — "И. И. Лажечников" = "Лажечников Иван Иванович",
 * "Лев Толстой" = "Толстой Л. Н.", but "Иванов А." ≠ "Иванов Б." and
 * "Андрей Платонов" ≠ "Богданов Андрей Платонович".
 */
export function authorsCompatible(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  return fitsInto(a, b) || fitsInto(b, a);
}

// "Не указан", "Автор не указан", "Неизвестен", "Коллектив авторов" are OCR/operator
// placeholders, not names.
export const isKnownAuthor = (tokens: string[]) =>
  tokens.length > 0 && !/^(автор )?не указан[ао]?$|^неизвест|^коллектив авторов$/.test(tokens.join(' '));

// Books without an author (empty or a placeholder) all get this one "author" when they are
// grouped: they match each other by title, never a book with a known author.
const UNKNOWN_AUTHOR = ['автор', 'неизвестен'];

export type MatchRow = { id: string; isbn: string | null; title: string | null; author: string | null };

/**
 * How the Duplicates screen looks for copies: the same valid ISBN, the same normalized title
 * with compatible authors, or a similar title (see titleCore) with compatible authors.
 */
export type Criterion = 'isbn' | 'exact' | 'fuzzy';

/**
 * A candidate group — books the criterion considers the same. Every criterion partitions the
 * books, so `id` (the smallest book id) is unique within one criterion. Admin decisions never
 * cut a group; they only resolve its pairs (see groupState).
 */
export type DuplicateGroup = { criterion: Criterion; id: string; key: string; ids: string[] };

// Prepositions and conjunctions carry no meaning in a title core
const TITLE_STOPWORDS = new Set(['в', 'во', 'и', 'на', 'с', 'со', 'о', 'об', 'обо', 'из', 'к', 'ко', 'по', 'у', 'а', 'за', 'для', 'от', 'до']);
const VOLUME_WORD = /^(книг(а|и|е|у|ах|ами)?|кн|том(а|е|у|ов|ах|ам|ами)?|т|част(ь|и|ях|ей|ям)|ч|выпуск(а|и|е|ов|ах)?|вып)$/;
const VOLUME_ABBR: Array<[RegExp, string]> = [
  [/^(книг|кн)/, 'Кн.'],
  [/^(том|т$)/, 'Т.'],
  [/^(част|ч$)/, 'Ч.'],
  [/^(выпуск|вып)/, 'Вып.'],
];
const ORDINALS: Array<[RegExp, number]> = [
  [/^(перв|од(ин|на|ну|ной|ном))/, 1],
  [/^(втор|дв(а|е|ух|ум))/, 2],
  [/^(трет|тр(и|ех|ем)$)/, 3],
  [/^(четв[её]рт|четыр)/, 4],
  [/^пят/, 5],
  [/^шест/, 6],
  [/^(седьм|сем(ь|и)$)/, 7],
  [/^(восьм|восем)/, 8],
  [/^девят/, 9],
  [/^десят/, 10],
];
// Latin x is already Cyrillic х after normalizeTitle
const ROMAN = /^[ivxх]+$/;

function romanToInt(s: string): number | null {
  const v: Record<string, number> = { i: 1, v: 5, x: 10, х: 10 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]];
    const next = v[s[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total > 0 ? total : null;
}

/** Volume number of a token next to a volume word: "2", "ii", "вторая" → 2. */
function numberValue(t: string | undefined): number | null {
  if (!t) return null;
  if (/^\d{1,3}$/.test(t)) return parseInt(t, 10);
  if (ROMAN.test(t) && t !== 'х') return romanToInt(t);
  for (const [re, n] of ORDINALS) if (re.test(t)) return n;
  return null;
}

const titleWords = (s?: string | null) => normalizeTitle(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// A volume word counts only next to a number ("книга 2", "том первый") or as "в двух книгах",
// so "Книга джунглей" keeps its "книга". The number goes with it.
function volumeMarks(words: string[]): boolean[] {
  const drop = words.map(() => false);
  words.forEach((w, i) => {
    if (!VOLUME_WORD.test(w)) return;
    const prev = numberValue(words[i - 1]) !== null;
    const next = numberValue(words[i + 1]) !== null;
    if (!prev && !next && !/ах$/.test(w)) return;
    drop[i] = true;
    if (prev) drop[i - 1] = true;
    if (next) drop[i + 1] = true;
  });
  return drop;
}

/**
 * The words that name the work, in order: punctuation, prepositions and volume markers are
 * dropped. "Бухара (Воспоминания): В двух книгах. Книга 1" → ["бухара", "воспоминания"].
 */
export function titleCore(title?: string | null): string[] {
  const words = titleWords(title);
  const drop = volumeMarks(words);
  return words.filter((w, i) => !drop[i] && !TITLE_STOPWORDS.has(w));
}

/** "Кн. 1" for "… Книга 1", "Т. 2" for "Том второй"; null when the title names no volume. */
export function volumeLabel(title?: string | null): string | null {
  const words = titleWords(title);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // "в двух книгах" is a count of volumes, not a volume number
    if (!VOLUME_WORD.test(w) || /ах$/.test(w)) continue;
    const n = numberValue(words[i + 1]) ?? numberValue(words[i - 1]);
    if (n === null) continue;
    const abbr = VOLUME_ABBR.find(([re]) => re.test(w))?.[1] ?? '';
    return `${abbr} ${n}`;
  }
  return null;
}

// Edit distance ≤ 1 (one substitution, insertion or deletion)
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Words of 6+ letters tolerate one OCR typo ("воспомипания"); shorter ones must be identical
const MIN_TYPO_WORD = 6;
const wordsMatch = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= MIN_TYPO_WORD && withinOneEdit(a, b));

/** The shorter core is the start of the longer one: ["бухара"] fits ["бухара", "воспоминания"]. */
export function coresMatch(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length > 0 && short.every((w, i) => wordsMatch(w, long[i]));
}

// Deletion keys of a word that tolerates a typo: the word itself and the word with each letter
// deleted — two words one edit apart always share one of these.
function deletionKeys(w: string): string[] {
  const keys = new Set([w]);
  for (let i = 0; i < w.length; i++) keys.add(w.slice(0, i) + w.slice(i + 1));
  return [...keys];
}

/** Pairs of distinct words of the list that match up to a typo (see wordsMatch). */
function typoNeighbours(words: string[]): Array<[string, string]> {
  const byKey = new Map<string, string[]>();
  for (const w of words) {
    if (w.length < MIN_TYPO_WORD) continue;
    for (const k of deletionKeys(w)) {
      const ws = byKey.get(k);
      if (ws) ws.push(w); else byKey.set(k, [w]);
    }
  }
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const ws of byKey.values()) {
    for (let x = 0; x < ws.length; x++) {
      for (let y = x + 1; y < ws.length; y++) {
        const k = ws[x] < ws[y] ? `${ws[x]}\n${ws[y]}` : `${ws[y]}\n${ws[x]}`;
        if (seen.has(k) || !wordsMatch(ws[x], ws[y])) continue;
        seen.add(k);
        pairs.push([ws[x], ws[y]]);
      }
    }
  }
  return pairs;
}

type Prepared = { id: string; isbn: string | null; tokens: string[]; key: string };

/**
 * Union of linked pairs with complete linkage: two components merge only when every author of
 * one fits every author of the other (a vague "Лев Толстой" can't chain Лев Николаевич and
 * Лев Львович) and, with respectIsbn, when together they hold at most one valid ISBN.
 * Items must be sorted by id and pairs in index order — complete linkage is order-dependent.
 */
function cluster(items: Prepared[], pairs: Array<[number, number]>, respectIsbn: boolean): number[][] {
  const parent = items.map((_, i) => i);
  const members = items.map((_, i) => [i]);
  const isbns = items.map((it) => new Set(it.isbn ? [it.isbn] : []));
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [i, j] of pairs) {
    const ri = find(i);
    const rj = find(j);
    if (ri === rj) continue;
    if (respectIsbn && new Set([...isbns[ri], ...isbns[rj]]).size > 1) continue;
    const mi = members[ri];
    const mj = members[rj];
    if (!mi.every((x) => mj.every((y) => authorsCompatible(items[x].tokens, items[y].tokens)))) continue;
    parent[ri] = rj;
    members[rj] = [...mj, ...mi];
    for (const isbn of isbns[ri]) isbns[rj].add(isbn);
  }
  return items
    .map((_, i) => i)
    .filter((i) => find(i) === i && members[i].length >= 2)
    .map((i) => members[i].sort((a, b) => a - b));
}

const byId = <T extends { id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const toGroup = (criterion: Criterion, items: Prepared[], idx: number[]): DuplicateGroup => {
  const ids = idx.map((i) => items[i].id);
  return { criterion, id: ids[0], key: items[idx[0]].key, ids };
};

/**
 * Candidate groups for one criterion. Rows are sorted by id first: complete linkage is
 * order-dependent and the SQL returns rows in on-disk order, which background updates and
 * autovacuum reshuffle — so the groups (and the card count) don't drift with nobody working.
 * - isbn: one group per valid ISBN shared by ≥ 2 books; title and author are not checked.
 * - exact: the same normalized title, compatible authors.
 * - fuzzy: one title core is the start of the other (typos allowed), compatible authors.
 * respectIsbn (title criteria only): books with two different valid ISBNs are not linked —
 * another edition or volume.
 * includeUnknownAuthor (title criteria only): books without an author (empty or "Не указан")
 * are grouped with each other by title; off (default) — they are left out.
 */
export function buildDuplicateGroups(
  rows: MatchRow[],
  criterion: Criterion,
  respectIsbn = true,
  includeUnknownAuthor = false,
): DuplicateGroup[] {
  const sorted = byId(rows);

  if (criterion === 'isbn') {
    const byIsbn = new Map<string, string[]>();
    for (const r of sorted) {
      const isbn = canonicalIsbn(r.isbn);
      if (!isbn) continue;
      const ids = byIsbn.get(isbn);
      if (ids) ids.push(r.id); else byIsbn.set(isbn, [r.id]);
    }
    return [...byIsbn]
      .filter(([, ids]) => ids.length >= 2)
      .map(([isbn, ids]) => ({ criterion, id: ids[0], key: isbn, ids }));
  }

  const items: Prepared[] = [];
  const cores: string[][] = [];
  for (const r of sorted) {
    const title = normalizeTitle(r.title);
    if (!title || title === 'новая книга') continue;
    let tokens = authorTokens(r.author);
    if (!isKnownAuthor(tokens)) {
      if (!includeUnknownAuthor) continue;
      tokens = UNKNOWN_AUTHOR;
    }
    const core = criterion === 'fuzzy' ? titleCore(r.title) : [];
    if (criterion === 'fuzzy' && !core.length) continue;
    items.push({ id: r.id, isbn: canonicalIsbn(r.isbn), tokens, key: criterion === 'fuzzy' ? core.join(' ') : title });
    cores.push(core);
  }

  // Candidate pairs come from buckets: the whole title (exact) or the core's first word (fuzzy —
  // a core that starts another shares its first word, up to a typo: such words' buckets are
  // compared with each other too).
  const buckets = new Map<string, number[]>();
  items.forEach((it, i) => {
    const k = criterion === 'fuzzy' ? cores[i][0] : it.key;
    const b = buckets.get(k);
    if (b) b.push(i); else buckets.set(k, [i]);
  });
  const pairs: Array<[number, number]> = [];
  const seen = new Set<number>();
  const consider = (i: number, j: number) => {
    const code = i < j ? i * items.length + j : j * items.length + i;
    if (i === j || seen.has(code)) return;
    seen.add(code);
    if (respectIsbn && items[i].isbn && items[j].isbn && items[i].isbn !== items[j].isbn) return;
    if (criterion === 'fuzzy' && !coresMatch(cores[i], cores[j])) return;
    if (!authorsCompatible(items[i].tokens, items[j].tokens)) return;
    pairs.push(i < j ? [i, j] : [j, i]);
  };
  // Compatible authors always share a name part of 3+ letters (the surname), so inside a bucket
  // only books sharing one are compared — a big "Избранное" bucket is not checked pair by pair.
  const bySurname = (idx: number[]) => {
    const m = new Map<string, number[]>();
    for (const i of idx) {
      for (const t of new Set(items[i].tokens)) {
        if (t.length < 3) continue;
        const l = m.get(t);
        if (l) l.push(i); else m.set(t, [i]);
      }
    }
    return m;
  };
  for (const b of buckets.values()) {
    if (b.length < 2) continue;
    for (const l of bySurname(b).values()) {
      for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) consider(l[x], l[y]);
    }
  }
  if (criterion === 'fuzzy') {
    for (const [w1, w2] of typoNeighbours([...buckets.keys()])) {
      const other = bySurname(buckets.get(w2)!);
      for (const i of buckets.get(w1)!) {
        for (const t of new Set(items[i].tokens)) for (const j of other.get(t) ?? []) consider(i, j);
      }
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  return cluster(items, pairs, respectIsbn).map((idx) => {
    const group = toGroup(criterion, items, idx);
    // The shortest core names a fuzzy group best ("бухара", not "бухара воспоминания")
    if (criterion === 'fuzzy') group.key = idx.map((i) => items[i].key).sort((a, b) => a.length - b.length)[0];
    return group;
  });
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export type StateRow = MatchRow & { copyGroupId: string | null };

/**
 * Where a group's review stands. A pair is decided when both books are in one copy set
 * (copies), in two different sets (not copies — follows from the sets), or resolved "not
 * copies" in duplicate_resolutions. Two different ISBNs do not decide a pair — that is the
 * admin's call. The group leaves the queue once every pair is decided.
 * - sets: confirmed copy sets inside the group
 * - looseIds: books in no set that still have an undecided pair
 * - excludedIds: books in no set whose every pair is resolved "not copies" (shown folded)
 * - conflictPairs: resolved "not copies" but in one set — old data; the set wins
 */
export function groupState(ids: string[], rowsById: Map<string, StateRow>, resolved: Set<string>) {
  const rows = ids.map((id) => rowsById.get(id)).filter((r): r is StateRow => !!r);
  const resolvedPairs: Array<[string, string]> = [];
  const conflictPairs: Array<[string, string]> = [];
  const undecided = new Set<string>();
  let unresolvedCount = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const isResolved = resolved.has(pairKey(a.id, b.id));
      if (a.copyGroupId && a.copyGroupId === b.copyGroupId) {
        if (isResolved) conflictPairs.push([a.id, b.id]);
      } else if (isResolved) {
        resolvedPairs.push([a.id, b.id]);
      } else if (!a.copyGroupId || !b.copyGroupId) {
        unresolvedCount++;
        undecided.add(a.id);
        undecided.add(b.id);
      }
    }
  }
  const sets = new Map<string, string[]>();
  const looseIds: string[] = [];
  const excludedIds: string[] = [];
  for (const r of rows) {
    if (r.copyGroupId) {
      const s = sets.get(r.copyGroupId);
      if (s) s.push(r.id); else sets.set(r.copyGroupId, [r.id]);
    } else (undecided.has(r.id) ? looseIds : excludedIds).push(r.id);
  }
  return {
    sets: [...sets].map(([copyGroupId, setIds]) => ({ copyGroupId, ids: setIds })),
    looseIds,
    excludedIds,
    resolvedPairs,
    conflictPairs,
    unresolvedCount,
  };
}


/**
 * What a group's books share and where they differ, as chips: ISBN when all valid ISBNs are
 * one, title when all normalized titles are equal ("Похожее название" for a fuzzy group),
 * author when every known author fits every other. isbnDiffers lists books whose valid ISBN
 * is not the group's most common one.
 */
export function groupMatch(rows: MatchRow[], criterion: Criterion) {
  const matchedFields: string[] = [];
  const differingFields: string[] = [];

  const isbnCount = new Map<string, number>();
  for (const r of rows) {
    const isbn = canonicalIsbn(r.isbn);
    if (isbn) isbnCount.set(isbn, (isbnCount.get(isbn) ?? 0) + 1);
  }
  const [mainIsbn] = [...isbnCount].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] ?? [];
  if (isbnCount.size > 1) differingFields.push('ISBN');
  else if (mainIsbn && isbnCount.get(mainIsbn)! >= 2) matchedFields.push('ISBN');
  const isbnDiffers = isbnCount.size > 1
    ? rows.filter((r) => { const i = canonicalIsbn(r.isbn); return i && i !== mainIsbn; }).map((r) => r.id)
    : [];

  const titles = new Set(rows.map((r) => normalizeTitle(r.title)));
  if (titles.size === 1) matchedFields.push('Название');
  else if (criterion === 'fuzzy') matchedFields.push('Похожее название');
  else differingFields.push('Название');

  const authors = rows.map((r) => authorTokens(r.author)).filter(isKnownAuthor);
  if (authors.length >= 2) {
    const fit = authors.every((a, i) => authors.slice(i + 1).every((b) => authorsCompatible(a, b)));
    (fit ? matchedFields : differingFields).push('Автор');
  }

  return { matchedFields, differingFields, isbnDiffers };
}

/**
 * Copy sets for already-confirmed copies (isCopy=true). Plain union (they were confirmed by an
 * admin, so over-linking is not a concern) of: existing copy sets, same valid ISBN, same title
 * with compatible (or both missing) authors unless the books have two different valid ISBNs,
 * and same raw ISBN text with the same 20-char title start — the last keeps every grouping the
 * old ISBN-string-based Copies screen showed (e.g. OCR'd authors "Коледов Л. А."/"Коледов А. А.").
 * Returns one array of ids per set.
 */
export function buildCopySets(rows: Array<MatchRow & { copyGroupId: string | null }>): string[][] {
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const linkAll = (keyOf: (r: (typeof rows)[number]) => string | null) => {
    const first = new Map<string, string>();
    for (const r of rows) {
      const k = keyOf(r);
      if (!k) continue;
      const f = first.get(k);
      if (f) union(f, r.id); else first.set(k, r.id);
    }
  };

  linkAll((r) => r.copyGroupId);
  linkAll((r) => canonicalIsbn(r.isbn));
  linkAll((r) => {
    const raw = (r.isbn ?? '').replace(/[-\s]/g, '').toUpperCase();
    // Skip placeholders like 978-5-0000-0000-0 (shared by thousands of imported books):
    // with a generic title start ("собрание сочинений в") they would link unrelated sets.
    if (!raw || /0{5,}/.test(raw)) return null;
    return `${raw}\n${normalizeTitle(r.title).slice(0, 20)}`;
  });

  const byTitle = new Map<string, Array<{ id: string; isbn: string | null; tokens: string[] }>>();
  for (const r of rows) {
    const title = normalizeTitle(r.title);
    if (!title) continue;
    const p = { id: r.id, isbn: canonicalIsbn(r.isbn), tokens: authorTokens(r.author) };
    const bucket = byTitle.get(title);
    if (bucket) bucket.push(p); else byTitle.set(title, [p]);
  }
  for (const bs of byTitle.values()) {
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        if (a.isbn && b.isbn && a.isbn !== b.isbn) continue;
        const noAuthors = !a.tokens.length && !b.tokens.length;
        if (noAuthors || authorsCompatible(a.tokens, b.tokens)) union(a.id, b.id);
      }
    }
  }

  const sets = new Map<string, string[]>();
  for (const r of rows) {
    const root = find(r.id);
    const s = sets.get(root);
    if (s) s.push(r.id); else sets.set(root, [r.id]);
  }
  return [...sets.values()];
}
