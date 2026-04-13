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
