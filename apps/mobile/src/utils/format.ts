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
