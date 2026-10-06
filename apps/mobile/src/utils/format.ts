export function formatPrintRun(n: number | undefined | null): string | undefined {
  if (n == null) return undefined;
  return n.toLocaleString('ru-RU');
}

export function formatPrice(price: number | undefined | null): string {
  if (price == null) return '—';
  return `${Number(price).toFixed(2)} ₽`;
}

export function formatDimensions(w: number, h: number, d: number): string {
  return `${w}x${h}x${d}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Caption for a book an admin took into their home library ("Домашняя книга"), or null. */
export function libraryLabel(book: {
  status?: string;
  libraryOwner?: { fullName: string } | null;
}): string | null {
  if (book.status !== 'in_library') return null;
  return `В библиотеке: ${book.libraryOwner?.fullName ?? 'администратора'}`;
}

/** Russian plural form: pluralRu(3, "книга", "книги", "книг") → "книги" */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
