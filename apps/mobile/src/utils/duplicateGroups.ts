import type { Book, DuplicateGroup } from '../types';

// Mirrors groupState in apps/backend/src/books/duplicate-matching.ts so a group can be updated
// in place after an action, without refetching the page.

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Recomputes sets / loose / folded books and the undecided pair count from the group's books. */
export function recomputeGroup(group: DuplicateGroup): DuplicateGroup {
  const books = group.books;
  const ids = new Set(books.map((b) => b.id));
  const resolvedPairs = group.resolvedPairs.filter(([a, b]) => ids.has(a) && ids.has(b));
  const resolved = new Set(resolvedPairs.map(([a, b]) => pairKey(a, b)));
  const explicit: Array<[string, string]> = [];
  const conflictPairs: Array<[string, string]> = [];
  const undecided = new Set<string>();
  let unresolvedCount = 0;
  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const a = books[i];
      const b = books[j];
      const isResolved = resolved.has(pairKey(a.id, b.id));
      if (a.copyGroupId && a.copyGroupId === b.copyGroupId) {
        if (isResolved) conflictPairs.push([a.id, b.id]);
      } else if (isResolved) {
        explicit.push([a.id, b.id]);
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
  for (const b of books) {
    if (b.copyGroupId) {
      const s = sets.get(b.copyGroupId);
      if (s) s.push(b.id); else sets.set(b.copyGroupId, [b.id]);
    } else (undecided.has(b.id) ? looseIds : excludedIds).push(b.id);
  }
  return {
    ...group,
    // keep the explicit resolutions inside a set too — taking a book out of the set brings them back
    resolvedPairs,
    sets: [...sets].map(([copyGroupId, setIds]) => ({ copyGroupId, ids: setIds })),
    looseIds,
    excludedIds,
    conflictPairs,
    unresolvedCount,
  };
}

/** Every pair between `a` and `b` that is not already resolved "not copies" in the group. */
export function newPairs(group: DuplicateGroup, a: string[], b: string[]): Array<[string, string]> {
  const resolved = new Set(group.resolvedPairs.map(([x, y]) => pairKey(x, y)));
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const x of a) {
    for (const y of b) {
      const k = pairKey(x, y);
      if (x === y || resolved.has(k) || seen.has(k)) continue;
      seen.add(k);
      pairs.push([x, y]);
    }
  }
  return pairs;
}

/** Explicit "not copies" among these books (they would be overridden by marking them copies). */
export function resolvedAmong(group: DuplicateGroup, ids: string[]): Array<[string, string]> {
  const set = new Set(ids);
  return group.resolvedPairs.filter(([a, b]) => set.has(a) && set.has(b));
}

/** Patches books by id and recomputes the group state. */
export function patchBooks(
  group: DuplicateGroup,
  patch: (book: Book) => Book,
  resolvedPairs = group.resolvedPairs,
): DuplicateGroup {
  return recomputeGroup({ ...group, books: group.books.map(patch), resolvedPairs });
}

/**
 * Splits a group's undecided books (outside sets) into new arrivals and books the admin already
 * went through. A book with no "not copies" at all is new. Of the others, the oldest ones that
 * are all "not copies" of each other are "already sorted"; when there are at least two of them,
 * the rest — books still undecided against them, e.g. added after the admin's review — are new
 * too. With fewer than two there is no sorted part to speak of (a split-off remainder still
 * undecided among itself), and those books stay plainly undecided.
 */
export function splitLoose(
  group: DuplicateGroup,
  createdAt: (id: string) => string,
): { fresh: string[]; reviewed: string[] } {
  const resolved = new Set(group.resolvedPairs.map(([a, b]) => pairKey(a, b)));
  const touched = new Set(group.resolvedPairs.flat());
  const fresh = group.looseIds.filter((id) => !touched.has(id));
  const older = group.looseIds
    .filter((id) => touched.has(id))
    .sort((a, b) => createdAt(a).localeCompare(createdAt(b)) || a.localeCompare(b));
  const sorted: string[] = [];
  for (const id of older) {
    if (sorted.every((s) => resolved.has(pairKey(s, id)))) sorted.push(id);
  }
  if (sorted.length < 2) return { fresh, reviewed: older };
  const late = older.filter((id) => !sorted.includes(id));
  return { fresh: [...fresh, ...late], reviewed: sorted };
}

/** The heading of a group: the ISBN, or the shortest title among its books. */
export function groupTitle(group: DuplicateGroup): string {
  if (group.criterion === 'isbn') return `ISBN: ${group.key}`;
  const titles = group.books.map((b) => b.title).filter(Boolean);
  return titles.sort((a, b) => a.length - b.length)[0] ?? group.key;
}
