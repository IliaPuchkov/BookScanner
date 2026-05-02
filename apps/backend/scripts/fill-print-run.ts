/**
 * One-time script to fill printRun (тираж) for books that have NULL in that field.
 * Uses Gemini 2.0 Flash Lite via Polza.AI to determine the print run from book metadata + photos.
 *
 * Usage:
 *   docker exec -it bookscanner-backend npx ts-node --transpile-only /app/apps/backend/scripts/fill-print-run.ts --limit 20
 *
 * Parameters:
 *   --limit N        How many books to process per run (default: 10)
 *   --concurrency N  How many parallel AI requests (default: 1)
 *   --delay N        Milliseconds between each batch of parallel requests (default: 2000)
 *   --dry-run        List matching books without making AI calls or writing to DB
 *   --retry-unknown  Retry books where AI previously could not find the print run
 *
 * Books where AI could not determine the print run are saved to fill-print-run-skipped.json
 * so they are not retried on subsequent runs (unless --retry-unknown is passed).
 * printRun field is never written with 0 — 0 is reserved for genuinely rare books.
 */

import * as fs from "fs";
import * as path from "path";

// Load .env manually (same pattern as ozon-discover-ids.ts)
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

import OpenAI from "openai";
import { DataSource } from "typeorm";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = 10;
  let concurrency = 1;
  let delay = 2000;
  let dryRun = false;
  let retryUnknown = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0) limit = parsed;
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0) concurrency = parsed;
    } else if (args[i] === "--delay" && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed >= 0) delay = parsed;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--retry-unknown") {
      retryUnknown = true;
    }
  }

  return { limit, concurrency, delay, dryRun, retryUnknown };
}

// ---------------------------------------------------------------------------
// Skipped IDs file — tracks books where AI could not find the print run.
// printRun stays NULL in DB; these IDs are excluded from future runs.
// ---------------------------------------------------------------------------

const SKIPPED_FILE = path.resolve(__dirname, "fill-print-run-skipped.json");

function loadSkippedIds(): Set<string> {
  if (!fs.existsSync(SKIPPED_FILE)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(SKIPPED_FILE, "utf-8"));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

function saveSkippedIds(ids: Set<string>): void {
  fs.writeFileSync(SKIPPED_FILE, JSON.stringify([...ids], null, 2));
}

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

interface BookRow {
  id: string;
  sku: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  yearPublished: number | null;
  photos: Array<{ fileUrl: string; sortOrder: number }>;
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

function buildPrompt(book: BookRow): string {
  const hasPhotos = book.photos.length > 0;
  return `Ты — помощник для идентификации данных о книгах.

Книга:
  Название: ${book.title}
  Автор: ${book.author ?? "не указан"}
  ISBN: ${book.isbn ?? "не указан"}
  Издательство: ${book.publisher ?? "не указано"}
  Год издания: ${book.yearPublished ?? "не указан"}

Задача: определи тираж этой книги (количество напечатанных экземпляров).
${hasPhotos ? "На фотографиях книги может быть видна страница с выходными данными, где указан тираж. Ищи число после слова 'Тираж' или число где после него стоит 'экз.'. " : "Используй свои знания об этой книге."}

Верни ТОЛЬКО одно целое число — тираж книги в экземплярах.
Без слов, без пояснений, без единиц измерения. Только число.
Если тираж неизвестен или не удаётся определить — верни 0.`;
}

function parseResponse(raw: string): number | null {
  // Strip spaces, commas, dots, apostrophes (common thousand separators)
  const cleaned = raw.replace(/[\s,.']/g, "").trim();
  const num = parseInt(cleaned, 10);
  if (isNaN(num) || num < 0) return null;
  return num;
}

async function askAiForPrintRun(
  client: OpenAI,
  book: BookRow,
): Promise<number | null> {
  const prompt = buildPrompt(book);

  const imageContents = book.photos
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(1, 3) // Skip cover (photo 0), use info pages
    .map((p) => ({
      type: "image_url" as const,
      image_url: { url: p.fileUrl },
    }));

  const response = await client.chat.completions.create({
    model: "google/gemini-2.0-flash-lite-001",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContents],
      },
    ],
    max_tokens: 50,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  return parseResponse(raw);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { limit, concurrency, delay, dryRun, retryUnknown } = parseArgs();

  if (!process.env.POLZA_AI_API_KEY && !dryRun) {
    console.error(
      "ERROR: POLZA_AI_API_KEY is not set in environment or .env file",
    );
    process.exit(1);
  }

  const skippedIds = retryUnknown ? new Set<string>() : loadSkippedIds();
  if (skippedIds.size > 0) {
    console.log(
      `Loaded ${skippedIds.size} previously skipped book(s) from ${path.basename(SKIPPED_FILE)}`,
    );
  }

  const db = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "bookscanner",
    entities: [],
  });

  await db.initialize();
  console.log("Connected to database");

  const rows: any[] = await db.query(
    `
    SELECT
      b.id,
      b.sku,
      b.title,
      b.author,
      b.isbn,
      b.publisher,
      b."yearPublished",
      COALESCE(
        json_agg(
          json_build_object('fileUrl', p."fileUrl", 'sortOrder', p."sortOrder")
          ORDER BY p."sortOrder"
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS photos
    FROM books b
    LEFT JOIN book_photos p ON p.book_id = b.id
    WHERE b."printRun" IS NULL
    GROUP BY b.id
    ORDER BY b."createdAt" ASC
    LIMIT $1
    `,
    [limit + skippedIds.size], // fetch extra to compensate for skipped
  );

  // Filter out previously skipped books (done in JS to keep SQL simple)
  const books: BookRow[] = rows
    .filter((b) => !skippedIds.has(b.id))
    .slice(0, limit);

  console.log(`Found ${books.length} books to process (limit: ${limit})`);

  if (dryRun) {
    console.log("\n[DRY RUN] Books that would be processed:");
    books.forEach((b, i) => {
      console.log(
        `  ${i + 1}. [${b.sku}] "${b.title}" — ${b.photos.length} photo(s)`,
      );
    });
    await db.destroy();
    return;
  }

  const client = new OpenAI({
    apiKey: process.env.POLZA_AI_API_KEY,
    baseURL: "https://polza.ai/api/v1",
  });

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < books.length; i += concurrency) {
    const chunk = books.slice(i, i + concurrency);

    await Promise.all(
      chunk.map(async (book) => {
        const num = ++processed;
        console.log(`\n[${num}/${books.length}] [${book.sku}] "${book.title}"`);

        try {
          const printRun = await askAiForPrintRun(client, book);

          if (printRun === null) {
            skippedIds.add(book.id);
            console.warn(
              `  [${book.sku}] WARNING: AI returned non-numeric response — added to skipped list`,
            );
            failed++;
          } else if (printRun === 0) {
            skippedIds.add(book.id);
            console.log(
              `  [${book.sku}] INFO: AI could not determine print run — added to skipped list`,
            );
            skipped++;
          } else {
            await db.query(`UPDATE books SET "printRun" = $1 WHERE id = $2`, [
              printRun,
              book.id,
            ]);
            console.log(`  [${book.sku}] OK: printRun = ${printRun}`);
            updated++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`  [${book.sku}] ERROR: ${message}`);
          failed++;
        }
      }),
    );

    if (i + concurrency < books.length) {
      await sleep(delay);
    }
  }

  saveSkippedIds(skippedIds);

  console.log("\n--- Summary ---");
  console.log(`Processed: ${processed}`);
  console.log(`Updated:   ${updated}`);
  console.log(
    `Skipped:   ${skipped}  (AI could not determine — saved to ${path.basename(SKIPPED_FILE)})`,
  );
  console.log(
    `Failed:    ${failed}  (error or non-numeric response — saved to ${path.basename(SKIPPED_FILE)})`,
  );
  console.log(`\nTo retry skipped books: add --retry-unknown flag`);

  await db.destroy();
}

main().catch((err) => {
  console.error(
    "Fatal error:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
