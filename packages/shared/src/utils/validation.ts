/**
 * Validate ISBN-10 or ISBN-13 format.
 */
export function isValidIsbn(isbn: string): boolean {
  const cleaned = isbn.replace(/[-\s]/g, '');

  if (cleaned.length === 10) {
    return isValidIsbn10(cleaned);
  }
  if (cleaned.length === 13) {
    return isValidIsbn13(cleaned);
  }
  return false;
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dXx]$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(isbn[i], 10) * (10 - i);
  }
  const check = isbn[9].toUpperCase() === 'X' ? 10 : parseInt(isbn[9], 10);
  sum += check;
  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(isbn[12], 10);
}

/**
 * Validate phone number (Russian format).
 */
export function isValidPhone(phone: string): boolean {
  return /^\+7\d{10}$/.test(phone);
}

/**
 * Validate email address.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
