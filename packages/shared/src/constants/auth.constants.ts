export const BCRYPT_ROUNDS = 10;

/** Consecutive failed logins before an account is temporarily locked. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 8;
/** How long an account stays locked after hitting the failed-login threshold (ms). */
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const JWT_ACCESS_EXPIRATION = 900; // 15 minutes in seconds
export const JWT_REFRESH_EXPIRATION = 604800; // 7 days in seconds
export const JWT_ACCESS_EXPIRATION_STRING = '15m';
export const JWT_REFRESH_EXPIRATION_STRING = '7d';
