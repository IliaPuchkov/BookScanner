import type { Book } from "../types";

type BookUpdatedListener = (book: Book) => void;

let listeners: BookUpdatedListener[] = [];

export const bookEvents = {
  onBookUpdated(listener: BookUpdatedListener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  emitBookUpdated(book: Book): void {
    listeners.forEach((l) => l(book));
  },
};

// Swap in the server's updated copy of a book, keeping it in whatever groups it's in
export function replaceBookInGroups<G extends { books: Book[] }>(
  groups: G[],
  updated: Book,
): G[] {
  return groups.map((g) =>
    g.books.some((b) => b.id === updated.id)
      ? { ...g, books: g.books.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)) }
      : g,
  );
}
