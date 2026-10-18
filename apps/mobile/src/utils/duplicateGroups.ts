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

/** The heading of a group: the ISBN, or the shortest title among its books. */
export function groupTitle(group: DuplicateGroup): string {
  if (group.criterion === 'isbn') return `ISBN: ${group.key}`;
  const titles = group.books.map((b) => b.title).filter(Boolean);
  return titles.sort((a, b) => a.length - b.length)[0] ?? group.key;
}
