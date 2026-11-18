/**
 * Ozon video covers for books that were published before the feature existed.
 * Runs on a workstation (the prod host has one vCPU): takes the list of published books
 * without a cover from the API, renders the covers on all cores and uploads them; the
 * server then sends them to Ozon in batches (cron, while «Видеообложки» is on).
 *
 * Needs ffmpeg (FFMPEG_PATH or on PATH) and an ADMIN account. Use a separate admin for
 * the script: a login replaces the account's refresh token, so the app on the phone of
 * the same account would be logged out.
 *
 *   cd apps/backend
 *   JB_LOGIN=… JB_PASSWORD=… pnpm exec ts-node scripts/video-cover-backfill.ts
 *
 * Env: JB_API (default https://jollybook.duckdns.org/api), JB_CONCURRENCY (default cores − 1),
 * JB_LIMIT (stop after N books, for a test run), FFMPEG_PATH.
 * Safe to stop (Ctrl+C) and start again: finished books drop out of the list.
 */
import * as os from 'os';

const CONCURRENCY = Math.max(1, Number(process.env.JB_CONCURRENCY) || os.cpus().length - 1);
// sharp runs on libuv's threadpool: one thread per parallel render (must be set before first use)
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, CONCURRENCY));

/* eslint-disable @typescript-eslint/no-var-requires */
import type * as RenderModule from '../src/ozon/video-cover/render-video-cover';
const { renderVideoCover } = require('../src/ozon/video-cover/render-video-cover') as typeof RenderModule;
const sharp = require('sharp') as typeof import('sharp');
import { mkdtemp, readFile, rm } from 'fs/promises';
import * as path from 'path';

sharp.cache(false);
sharp.concurrency(1);

const API = (process.env.JB_API || 'https://jollybook.duckdns.org/api').replace(/\/$/, '');
const LOGIN = process.env.JB_LOGIN;
const PASSWORD = process.env.JB_PASSWORD;
const LIMIT = Number(process.env.JB_LIMIT) || Infinity;
const PAGE = 100;

interface PendingItem {
  bookId: string;
  sku: string;
  photosHash: string;
  photos: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`${new Date().toLocaleTimeString('ru-RU')} ${msg}`);

// ─── API with token refresh and retries ───────────────────────────────────────

interface Tokens {
  accessToken: string;
  refreshToken?: string;
}

let accessToken = '';
let refreshToken = '';

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneOrEmail: LOGIN, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Вход не удался: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as Tokens & { user?: { role?: string } };
  if (body.user?.role !== 'admin') throw new Error('Нужна учётная запись администратора');
  accessToken = body.accessToken;
  refreshToken = body.refreshToken ?? '';
}

async function refresh() {
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return login();
  const body = (await res.json()) as Tokens;
  accessToken = body.accessToken;
  refreshToken = body.refreshToken ?? refreshToken;
}

class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

async function api<T>(method: string, url: string, body?: FormData): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API}${url}`, { method, headers: { Authorization: `Bearer ${accessToken}` }, body });
    } catch (err) {
      if (attempt >= 5) throw err;
      await sleep(5000 * attempt); // network hiccup
      continue;
    }
    if (res.ok) return res.json() as Promise<T>;
    const text = await res.text();
    if (res.status === 401 && attempt <= 2) {
      await refresh();
      continue;
    }
    if (res.status === 403 && text.includes('PasswordChangeRequired')) {
      throw new Error('У этой учётной записи временный пароль — войдите в приложение и смените его');
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(res.status === 429 ? 60_000 : 10_000 * attempt);
      continue;
    }
    throw new HttpError(res.status, text);
  }
}

// ─── work list: pages of pending books, fetched as the workers need them ──────

let cursor: string | undefined;
let buffer: PendingItem[] = [];
let exhausted = false;
let fetching: Promise<void> | null = null;
let taken = 0;
let remainingAtStart = 0;

async function nextItem(): Promise<PendingItem | null> {
  while (!buffer.length && !exhausted) {
    fetching ??= (async () => {
      const q = `limit=${PAGE}${cursor ? `&after=${cursor}` : ''}`;
      const page = await api<{ remaining: number; items: PendingItem[] }>('GET', `/ozon/video-covers/pending?${q}`);
      if (!remainingAtStart) remainingAtStart = page.remaining;
      if (!page.items.length) exhausted = true;
      else {
        cursor = page.items[page.items.length - 1].bookId;
        buffer.push(...page.items);
      }
    })().finally(() => (fetching = null));
    await fetching;
  }
  if (!buffer.length || taken >= LIMIT) return null;
  taken++;
  return buffer.shift()!;
}

// ─── one book ─────────────────────────────────────────────────────────────────

async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 3) throw new Error(`Фото ${url}: ${err instanceof Error ? err.message : err}`);
      await sleep(3000 * attempt);
    }
  }
}

async function processBook(item: PendingItem, tmp: string): Promise<'done' | 'skipped'> {
  const photos = await Promise.all(item.photos.map(download));
  const out = path.join(tmp, `${item.bookId}.mp4`);
  try {
    await renderVideoCover(photos, out, { threads: 1 });
    const form = new FormData();
    form.append('photosHash', item.photosHash);
    form.append('file', new Blob([await readFile(out)], { type: 'video/mp4' }), 'cover.mp4');
    await api('POST', `/ozon/video-covers/${item.bookId}`, form);
    return 'done';
  } catch (err) {
    // photos changed or the book left Ozon meanwhile — the server renders it itself if needed
    if (err instanceof HttpError && err.status === 409) return 'skipped';
    throw err;
  } finally {
    await rm(out, { force: true });
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!LOGIN || !PASSWORD) throw new Error('Задайте JB_LOGIN и JB_PASSWORD');
  await login();
  log(`Вход выполнен, ${CONCURRENCY} потоков, сервер ${API}`);

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'jb-video-covers-'));
  const started = Date.now();
  let done = 0;
  let skipped = 0;
  let failed = 0;
  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('Останавливаюсь: дожидаюсь книг в работе (Ctrl+C ещё раз — выйти сразу)');
  });

  const report = () => {
    const mins = (Date.now() - started) / 60000;
    const rate = done / Math.max(mins, 0.01);
    const left = Math.max(remainingAtStart - done - skipped - failed, 0);
    const eta = rate > 0 ? `, осталось ~${(left / rate / 60).toFixed(1)} ч` : '';
    log(`готово ${done}, пропущено ${skipped}, ошибок ${failed} · ${rate.toFixed(1)} книг/мин${eta}`);
  };
  const timer = setInterval(report, 60_000);

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = await nextItem(); item && !stopping; item = await nextItem()) {
        try {
          if ((await processBook(item, tmp)) === 'done') done++;
          else skipped++;
        } catch (err) {
          failed++;
          log(`✗ ${item.sku}: ${err instanceof Error ? err.message : err}`);
          if (/Вход|учётн|временный пароль/.test(String(err))) stopping = true;
        }
      }
    }),
  );

  clearInterval(timer);
  await rm(tmp, { recursive: true, force: true });
  report();
  log(exhausted && !stopping ? 'Все книги обработаны.' : 'Остановлено — запустите снова, чтобы продолжить.');
  if (failed) log('Книги с ошибками останутся в списке — следующий запуск попробует их снова.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
