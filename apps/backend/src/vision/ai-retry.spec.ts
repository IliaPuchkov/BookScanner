import { classifyAiError, parseRetryAfterMs, retryDelayMs, shouldUseFallback } from './ai-retry';

const apiError = (status: number, message = '', headers: Record<string, string> = {}) =>
  Object.assign(new Error(`${status} ${message}`), { status, headers });

describe('classifyAiError', () => {
  it('retries the provider limit (429 without Retry-After)', () => {
    const info = classifyAiError(apiError(429, 'Превышен лимит запросов к провайдеру'));
    expect(info).toMatchObject({ status: 429, retryable: true, retryAfterMs: undefined });
    expect(info.userMessage).toMatch(/перегружен/);
  });

  it('keeps Retry-After of the Polza limit and names the wait when it is long', () => {
    const minute = classifyAiError(apiError(429, '', { 'retry-after': '20' }));
    expect(minute.retryAfterMs).toBe(20_000);
    expect(minute.userMessage).toMatch(/перегружен/);

    const daily = classifyAiError(apiError(429, '', { 'retry-after': '3600' }));
    expect(daily.userMessage).toBe('Исчерпан лимит запросов к ИИ. Повторите через 60 мин');
  });

  it('retries 503 "finish_reason: error" and other 5xx / 408', () => {
    for (const status of [503, 502, 500, 504, 408]) {
      expect(classifyAiError(apiError(status, 'Провайдер прервал генерацию')).retryable).toBe(true);
    }
  });

  it('retries 400 when the provider could not fetch our photo (522 from storage)', () => {
    const info = classifyAiError(
      apiError(400, 'Received 522 status code when fetching image from URL: https://storage…'),
    );
    expect(info.retryable).toBe(true);
    expect(info.userMessage).toMatch(/фото/);
  });

  it('never retries other client errors', () => {
    for (const status of [400, 401, 402, 403, 404, 413]) {
      expect(classifyAiError(apiError(status, 'bad')).retryable).toBe(false);
    }
    expect(classifyAiError(apiError(402)).userMessage).toMatch(/баланс/);
  });

  it('retries errors without a status (network, empty or broken JSON)', () => {
    expect(classifyAiError(new Error('AI returned empty response')).retryable).toBe(true);
    expect(classifyAiError(new SyntaxError('Unexpected token')).retryable).toBe(true);
  });
});

describe('parseRetryAfterMs', () => {
  it('reads seconds, retry-after-ms, an HTTP date and a Headers object', () => {
    expect(parseRetryAfterMs({ 'retry-after': '5' })).toBe(5000);
    expect(parseRetryAfterMs({ 'retry-after-ms': '1500', 'retry-after': '5' })).toBe(1500);
    const now = Date.parse('2026-11-26T10:00:00Z');
    expect(parseRetryAfterMs({ 'retry-after': 'Thu, 26 Nov 2026 10:00:30 GMT' }, now)).toBe(30_000);
    expect(parseRetryAfterMs(new Headers({ 'retry-after': '7' }))).toBe(7000);
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs({ 'retry-after': 'soon' })).toBeUndefined();
  });
});

describe('retryDelayMs', () => {
  it('grows 1, 2, 4, 8 s with at most 25% jitter', () => {
    const info = classifyAiError(apiError(503));
    expect([1, 2, 3, 4].map((a) => retryDelayMs(a, info, () => 0))).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDelayMs(1, info, () => 1)).toBe(1250);
  });

  it('waits exactly Retry-After when given', () => {
    expect(retryDelayMs(1, classifyAiError(apiError(429, '', { 'retry-after': '12' })), () => 1)).toBe(12_000);
  });
});

describe('shouldUseFallback', () => {
  const aborted = apiError(
    503,
    'Провайдер прервал генерацию для модели "google/gemini-2.5-flash-lite": ответ обрезан или повреждён. Повторите запрос.',
  );

  it('switches at once when the model stopped the answer itself', () => {
    expect(classifyAiError(aborted).generationAborted).toBe(true);
    expect(shouldUseFallback(classifyAiError(aborted), 1)).toBe(true);
  });

  it('switches after two overloads of the primary, or a long Retry-After', () => {
    const overloaded = classifyAiError(apiError(429, 'Превышен лимит запросов к провайдеру'));
    expect(shouldUseFallback(overloaded, 1)).toBe(false);
    expect(shouldUseFallback(overloaded, 2)).toBe(true);
    expect(shouldUseFallback(classifyAiError(apiError(429, '', { 'retry-after': '40' })), 1)).toBe(true);
    expect(shouldUseFallback(classifyAiError(apiError(429, '', { 'retry-after': '3' })), 1)).toBe(false);
  });

  it('keeps the model when another one would not help', () => {
    const photo = classifyAiError(apiError(400, 'Received 522 status code when fetching image from URL'));
    expect(shouldUseFallback(photo, 5)).toBe(false);
    expect(shouldUseFallback(classifyAiError(apiError(401)), 5)).toBe(false);
    expect(shouldUseFallback(classifyAiError(new Error('fetch failed')), 5)).toBe(false);
  });
});
