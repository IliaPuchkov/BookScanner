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

export type MatchRow = { id: string; isbn: string | null; title: string | null; author: string | null };

export type DuplicateGroup = { type: 'isbn' | 'title'; key: string; authorKey?: string; ids: string[] };

/**
 * Candidate duplicate groups: one group per valid ISBN shared by ≥ 2 books, plus title groups —
 * books with the same normalized title whose authors are compatible. A title pair where both
 * books have valid ISBNs is never linked (same ISBN → already an ISBN group; different → other
 * edition). Components merge only when every author of one fits every author of the other
 * (complete linkage), so a vague "Лев Толстой" can't chain Лев Николаевич and Лев Львович.
 */
export function buildDuplicateGroups(rows: MatchRow[]) {
  type Prepared = { id: string; isbn: string | null; tokens: string[] };
  const byIsbn = new Map<string, string[]>();
  const byTitle = new Map<string, Prepared[]>();
  for (const r of rows) {
    const isbn = canonicalIsbn(r.isbn);
    if (isbn) {
      const ids = byIsbn.get(isbn);
      if (ids) ids.push(r.id); else byIsbn.set(isbn, [r.id]);
    }
    const title = normalizeTitle(r.title);
    const tokens = authorTokens(r.author);
    if (!title || !tokens.length || title === 'новая книга') continue;
    const bucket = byTitle.get(title);
    const p = { id: r.id, isbn, tokens };
    if (bucket) bucket.push(p); else byTitle.set(title, [p]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [isbn, ids] of byIsbn) {
    if (ids.length >= 2) groups.push({ type: 'isbn', key: isbn, ids });
  }
  for (const [title, bs] of byTitle) {
    if (bs.length < 2) continue;
    const parent = bs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        if (bs[i].isbn && bs[j].isbn) continue;
        if (!authorsCompatible(bs[i].tokens, bs[j].tokens)) continue;
        const ri = find(i);
        const rj = find(j);
        if (ri === rj) continue;
        const pi = bs.filter((_, k) => find(k) === ri);
        const pj = bs.filter((_, k) => find(k) === rj);
        if (pi.every((x) => pj.every((y) => authorsCompatible(x.tokens, y.tokens)))) parent[ri] = rj;
      }
    }
    const comps = new Map<number, string[]>();
    bs.forEach((b, i) => {
      const r = find(i);
      const c = comps.get(r);
      if (c) c.push(b.id); else comps.set(r, [b.id]);
    });
    for (const ids of comps.values()) {
      // authorKey only needs to tell apart components of one title; the smallest id is stable
      if (ids.length >= 2) groups.push({ type: 'title', key: title, authorKey: [...ids].sort()[0], ids });
    }
  }
  return groups;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Best match level between any two books of a card: 100 = ISBN + title + author, 60 = any two,
 * 30 = one. Re-checks the books' actual ISBNs (two different valid ISBNs = other edition, skipped)
 * rather than trusting the group type.
 */
export function groupProbability(books: MatchRow[], groupType: 'isbn' | 'title') {
  let probability = 0;
  let matchedFields: string[] = [];
  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const a = books[i];
      const b = books[j];
      const ia = canonicalIsbn(a.isbn);
      const ib = canonicalIsbn(b.isbn);
      if (ia && ib && ia !== ib) continue;
      const na = normalizeTitle(a.title);
      const fields: string[] = [];
      if (ia && ia === ib) fields.push('ISBN');
      if (na && na === normalizeTitle(b.title)) fields.push('Название');
      if (authorsCompatible(authorTokens(a.author), authorTokens(b.author))) fields.push('Автор');
      const prob = fields.length >= 3 ? 100 : fields.length === 2 ? 60 : 30;
      if (prob > probability) { probability = prob; matchedFields = fields; }
    }
  }
  if (matchedFields.length === 0) return { probability: 30, matchedFields: [groupType === 'isbn' ? 'ISBN' : 'Название'] };
  return { probability, matchedFields };
}

export type DuplicateCard = DuplicateGroup & { componentKey?: string; probability: number; matchedFields: string[] };
type CardRow = MatchRow & { isCopy: boolean };

/**
 * The cards the Duplicates screen shows, built before paging so totals and the dashboard count
 * match the list. Each group is split into connected components of still-unresolved pairs (a
 * book marked "not a copy" of all others drops out; a subset split off as its own copy set
 * becomes a separate card). Fully confirmed sets (every book isCopy) and Low-probability cards
 * are dropped; a confirmed set plus a new book stays visible as a new arrival of that set.
 * Finally visible cards sharing a book are merged (see mergeOverlapping).
 */
export function buildDuplicateCards(
  groups: DuplicateGroup[],
  rowsById: Map<string, CardRow>,
  resolved: Set<string>,
): DuplicateCard[] {
  const cards: DuplicateCard[] = [];
  for (const group of groups) {
    const books = group.ids.map((id) => rowsById.get(id)).filter((b): b is CardRow => !!b);
    const parent = books.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < books.length; i++) {
      for (let j = i + 1; j < books.length; j++) {
        if (!resolved.has(pairKey(books[i].id, books[j].id))) parent[find(i)] = find(j);
      }
    }
    const components = new Map<number, CardRow[]>();
    books.forEach((b, i) => {
      const c = components.get(find(i));
      if (c) c.push(b); else components.set(find(i), [b]);
    });
    for (const comp of components.values()) {
      if (comp.length < 2 || comp.every((b) => b.isCopy)) continue;
      const { probability, matchedFields } = groupProbability(comp, group.type);
      if (probability < 60) continue;
      // Several components of one group share type/key/authorKey; componentKey keeps them apart.
      const componentKey = components.size > 1 ? comp[0].id : undefined;
      cards.push({ ...group, componentKey, ids: comp.map((b) => b.id), probability, matchedFields });
    }
  }
  return mergeOverlapping(cards, rowsById);
}

/**
 * A book with a valid ISBN sits in its ISBN group and in its title group, so without this the
 * same books show up on two or three cards. Cards sharing a book become one — but only when
 * every author across them is compatible (books without an author or with a placeholder like "Не указан" don't block), so an OCR'd
 * wrong ISBN can't glue "Старик Хоттабыч" to "Самое главное". Merging happens after the split
 * by resolutions, so sets the admin already separated or confirmed don't come back. A card that
 * overlaps nothing is returned unchanged; a merged one takes the key of its largest ISBN card
 * (it shows "ISBN: …") and the smallest id as componentKey to stay unique.
 */
// "Не указан", "Автор не указан", "Неизвестен" are OCR/operator placeholders, not names.
const isKnownAuthor = (tokens: string[]) =>
  tokens.length > 0 && !/^(автор )?не указан[ао]?$|^неизвест/.test(tokens.join(' '));

function mergeOverlapping(cards: DuplicateCard[], rowsById: Map<string, CardRow>): DuplicateCard[] {
  const parent = cards.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const authorsOf = new Map(
    cards.map((c, i) => [i, c.ids.map((id) => authorTokens(rowsById.get(id)?.author)).filter(isKnownAuthor)]),
  );
  const cardsOf = new Map<string, number[]>();
  cards.forEach((c, i) => {
    for (const id of c.ids) {
      for (const other of cardsOf.get(id) ?? []) {
        const ri = find(i);
        const ro = find(other);
        if (ri === ro) continue;
        const ai = authorsOf.get(ri)!;
        const ao = authorsOf.get(ro)!;
        if (!ai.every((x) => ao.every((y) => authorsCompatible(x, y)))) continue;
        parent[ri] = ro;
        authorsOf.set(ro, [...ao, ...ai]);
      }
      const seen = cardsOf.get(id);
      if (seen) seen.push(i); else cardsOf.set(id, [i]);
    }
  });
  const members = new Map<number, DuplicateCard[]>();
  cards.forEach((c, i) => {
    const m = members.get(find(i));
    if (m) m.push(c); else members.set(find(i), [c]);
  });
  return [...members.values()].map((cs) => {
    if (cs.length === 1) return cs[0];
    const ids = [...new Set(cs.flatMap((c) => c.ids))];
    const isbnCards = cs.filter((c) => c.type === 'isbn');
    const main = isbnCards.length
      ? isbnCards.reduce((a, b) => (b.ids.length > a.ids.length || (b.ids.length === a.ids.length && b.key < a.key) ? b : a))
      : cs[0];
    const books = ids.map((id) => rowsById.get(id)!);
    return { type: main.type, key: main.key, authorKey: main.authorKey, componentKey: [...ids].sort()[0], ids, ...groupProbability(books, main.type) };
  });
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
