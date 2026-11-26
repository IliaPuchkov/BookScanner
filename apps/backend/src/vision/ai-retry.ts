/**
 * What to do with an error from Polza.AI (OpenAI-compatible API), per their docs:
 * 408/502/503/5xx — retry with a pause; 429 — retry not before Retry-After (our Polza limit) or
 * with a growing pause (the model provider's limit, no Retry-After); 400/401/403/404/413 — never.
 * Exception: 400 "…when fetching image from URL" is the provider failing to download our photo
 * (e.g. 522 from the storage) — transient.
 */
export interface AiErrorInfo {
  status?: number;
  retryable: boolean;
  /** From Retry-After / retry-after-ms, if the server sent it. */
  retryAfterMs?: number;
  /**
   * The model stopped the answer itself (503 "Провайдер прервал генерацию", finish_reason "error").
   * Seen again and again on the same books (619_KNLU0W: 6 of 6) — likely Gemini's safety /
   * recitation stop on that content, so the same model won't do better on a retry.
   */
  generationAborted?: boolean;
  /** Short Russian text for the admin (app alert, ocr_results.errorMessage). */
  userMessage: string;
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504, 520, 522, 524]);

function header(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(n: string): string | null }).get(name) ?? undefined;
  }
  const value = (headers as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export function parseRetryAfterMs(headers: unknown, now = Date.now()): number | undefined {
  const ms = Number(header(headers, 'retry-after-ms'));
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const raw = header(headers, 'retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function classifyAiError(err: unknown): AiErrorInfo {
  const e = err as { status?: unknown; headers?: unknown; message?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const message = typeof e?.message === 'string' ? e.message : String(err);
  const retryAfterMs = parseRetryAfterMs(e?.headers);

  // No HTTP status: network error / timeout, empty or broken JSON from the model — retry.
  if (status === undefined) {
    return { retryable: true, userMessage: 'Сервис распознавания не ответил. Повторите через минуту' };
  }
  if (status === 429) {
    const minutes = retryAfterMs !== undefined ? Math.ceil(retryAfterMs / 60_000) : 0;
    return {
      status,
      retryable: true,
      retryAfterMs,
      userMessage:
        minutes > 1
          ? `Исчерпан лимит запросов к ИИ. Повторите через ${minutes} мин`
          : 'Сервис распознавания перегружен. Повторите через минуту',
    };
  }
  if (status === 400 && /fetching image/i.test(message)) {
    return { status, retryable: true, userMessage: 'ИИ не смог загрузить фото. Повторите через минуту' };
  }
  if (RETRYABLE_STATUSES.has(status) || status >= 500) {
    return {
      status,
      retryable: true,
      retryAfterMs,
      generationAborted: /прервал генерацию|finish_reason/i.test(message) || undefined,
      userMessage: 'Сервис распознавания временно недоступен. Повторите через минуту',
    };
  }
  if (status === 402) {
    return { status, retryable: false, userMessage: 'Недостаточно средств на балансе Polza.AI' };
  }
  if (status === 401 || status === 403) {
    return { status, retryable: false, userMessage: 'Polza.AI отклонил ключ API (POLZA_AI_API_KEY)' };
  }
  return { status, retryable: false, userMessage: `Ошибка запроса к ИИ (${status})` };
}

/** Default for the `vision_ai_fallback_model` setting (empty = no fallback): another host
 * (DeepInfra) than the primary Gemini Flash Lite (Google AI Studio "flex" tier). */
export const DEFAULT_FALLBACK_MODEL = 'qwen/qwen3-vl-235b-a22b-instruct';

/** Failures of the primary model in a row after which the rest of the call uses the fallback. */
export const FALLBACK_AFTER_FAILURES = 2;

/**
 * Switch to the fallback model? Only for the model's own trouble (overload, provider limit, aborted
 * generation): after FALLBACK_AFTER_FAILURES of them, or at once when Polza's per-model limit
 * says to wait longer than 5 s, or the model stopped the answer itself (book-specific, see
 * `generationAborted`). Not for our photo failing to download — another model won't help.
 */
export function shouldUseFallback(info: AiErrorInfo, primaryFailures: number): boolean {
  if (!info.retryable) return false;
  if (info.status === 400 || info.status === undefined) return false;
  if (info.retryAfterMs !== undefined && info.retryAfterMs > 5000) return true;
  if (info.generationAborted) return true;
  return primaryFailures >= FALLBACK_AFTER_FAILURES;
}

/**
 * Pause before attempt `attempt + 1`: Retry-After when given, else 1, 2, 4, 8… s (+ up to 25%
 * jitter so parallel queue jobs don't retry in lockstep).
 */
export function retryDelayMs(attempt: number, info: AiErrorInfo, random = Math.random): number {
  if (info.retryAfterMs !== undefined) return info.retryAfterMs;
  const base = 1000 * 2 ** (attempt - 1);
  return Math.round(base * (1 + 0.25 * random()));
}
