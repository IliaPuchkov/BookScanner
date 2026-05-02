/**
 * Finds all books sitting in the "OZON_IMPORT" box, extracts the real box number
 * from their SKU (format: boxNumber_code), creates the missing boxes (per user),
 * and moves books into them. The OZON_IMPORT box itself is left intact.
 *
 * Run: docker exec -it bookscanner-backend npx ts-node --transpile-only /app/apps/backend/scripts/assign-boxes-from-sku.ts
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'bookscanner',
  entities: [],
  synchronize: false,
});

interface BookRow {
  id: string;
  sku: string;
  created_by: string;
}

interface BoxRow {
  id: string;
  boxNumber: string;
  created_by: string;
}

async function main() {
  await dataSource.initialize();
  const query = dataSource.createQueryRunner();
  await query.connect();
  await query.startTransaction();

  try {
    // 1. Find the OZON_IMPORT box (may exist for multiple users)
    const importBoxes: BoxRow[] = await query.query(
      `SELECT id, "boxNumber", created_by FROM boxes WHERE "boxNumber" = 'OZON_IMPORT'`,
    );

    if (importBoxes.length === 0) {
      console.log('No OZON_IMPORT box found.');
      await query.rollbackTransaction();
      return;
    }

    const importBoxIds = importBoxes.map((b) => b.id);
    console.log(`Found ${importBoxes.length} OZON_IMPORT box(es): ${importBoxIds.join(', ')}`);

    // 2. Find all books in those boxes
    const books: BookRow[] = await query.query(`
      SELECT id, sku, created_by
      FROM books
      WHERE box_id = ANY($1::uuid[])
        AND sku IS NOT NULL
        AND sku LIKE '%\_%'
    `, [importBoxIds]);

    if (books.length === 0) {
      console.log('No books found in OZON_IMPORT box(es).');
      await query.rollbackTransaction();
      return;
    }

    console.log(`Found ${books.length} book(s) in OZON_IMPORT.`);

    // 3. Group by (userId, boxNumber)
    const groups = new Map<string, { userId: string; boxNumber: string; bookIds: string[] }>();

    for (const book of books) {
      const underscoreIndex = book.sku.indexOf('_');
      if (underscoreIndex === -1) {
        console.warn(`  Skipping book ${book.id}: SKU "${book.sku}" has no underscore.`);
        continue;
      }

      const boxNumber = book.sku.substring(0, underscoreIndex);
      const key = `${book.created_by}__${boxNumber}`;

      if (!groups.has(key)) {
        groups.set(key, { userId: book.created_by, boxNumber, bookIds: [] });
      }
      groups.get(key)!.bookIds.push(book.id);
    }

    console.log(`Grouped into ${groups.size} unique (user, boxNumber) pair(s).\n`);

    // 4. For each group, find or create the box, then assign books
    for (const { userId, boxNumber, bookIds } of groups.values()) {
      // Check if box already exists for this user
      const existing: BoxRow[] = await query.query(
        `SELECT id, "boxNumber", created_by FROM boxes WHERE "boxNumber" = $1 AND created_by = $2`,
        [boxNumber, userId],
      );

      let boxId: string;

      if (existing.length > 0) {
        boxId = existing[0].id;
        console.log(`  Box "${boxNumber}" (user ${userId}) already exists → id ${boxId}`);
      } else {
        const result: { id: string }[] = await query.query(
          `INSERT INTO boxes (id, "boxNumber", created_by, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
           RETURNING id`,
          [boxNumber, userId],
        );
        boxId = result[0].id;
        console.log(`  Created box "${boxNumber}" (user ${userId}) → id ${boxId}`);
      }

      // Assign books to the box
      await query.query(
        `UPDATE books SET box_id = $1 WHERE id = ANY($2::uuid[])`,
        [boxId, bookIds],
      );
      console.log(`    Assigned ${bookIds.length} book(s): ${bookIds.join(', ')}`);
    }

    await query.commitTransaction();
    console.log('\nDone.');
  } catch (err) {
    await query.rollbackTransaction();
    console.error('Error — transaction rolled back:', err);
    process.exit(1);
  } finally {
    await query.release();
    await dataSource.destroy();
  }
}

main();
