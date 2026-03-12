/**
 * Format dimensions as "WxHxD" string.
 */
export function formatDimensions(
  width: number,
  height: number,
  depth: number,
): string {
  return `${width}x${height}x${depth}`;
}

/**
 * Generate SKU from box number and unique code.
 */
export function formatSku(boxNumber: string, uniqueCode: string): string {
  return `${boxNumber}_${uniqueCode}`;
}

/**
 * Format price in rubles.
 */
export function formatPrice(price: number): string {
  return `${price.toFixed(2)} ₽`;
}
