import { MigrationInterface, QueryRunner } from 'typeorm';

// On prod duplicate_resolutions was created without the UNIQUE (book1_id, book2_id) and the
// book1_id < book2_id check that 1711200000000 declares, so `orIgnore()` (ON CONFLICT DO NOTHING)
// never skipped anything and a pair resolved twice got two rows (~4.9k extra rows by 2026-10-18).
// Keeps the earliest row of every pair (so each "not copies" decision survives with its original
// time), stores pairs in sorted order and adds the missing unique index + check. Aborts if the
// set of resolved pairs would change. down() drops the index/check; removed repeats are not
// restored (they carried no information).
export class DedupeDuplicateResolutions1747900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const countPairs = async (): Promise<number> => {
      const [{ n }] = await queryRunner.query(
        `SELECT count(DISTINCT (LEAST(book1_id, book2_id), GREATEST(book1_id, book2_id)))::int AS n
         FROM duplicate_resolutions`,
      );
      return n;
    };
    const pairsBefore = await countPairs();

    await queryRunner.query(`
      DELETE FROM duplicate_resolutions r
      USING (
        SELECT id, row_number() OVER (
          PARTITION BY LEAST(book1_id, book2_id), GREATEST(book1_id, book2_id)
          ORDER BY resolved_at, id
        ) AS n
        FROM duplicate_resolutions
      ) d
      WHERE r.id = d.id AND d.n > 1
    `);
    await queryRunner.query(`
      UPDATE duplicate_resolutions
      SET book1_id = book2_id, book2_id = book1_id
      WHERE book1_id > book2_id
    `);

    const pairsAfter = await countPairs();
    const [{ rows }] = await queryRunner.query(`SELECT count(*)::int AS rows FROM duplicate_resolutions`);
    if (pairsAfter !== pairsBefore || rows !== pairsAfter) {
      throw new Error(`duplicate_resolutions dedupe check failed: pairs ${pairsBefore} → ${pairsAfter}, rows ${rows}`);
    }

    // Fresh databases built by 1711200000000 already have both; add them only where missing
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
          WHERE c.relname = 'duplicate_resolutions' AND i.indisunique AND NOT i.indisprimary
        ) THEN
          CREATE UNIQUE INDEX "uq_dup_res_pair" ON duplicate_resolutions (book1_id, book2_id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'duplicate_resolutions'::regclass AND contype = 'c'
        ) THEN
          ALTER TABLE duplicate_resolutions ADD CONSTRAINT "chk_dup_res_order" CHECK (book1_id < book2_id);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_dup_res_pair"`);
    await queryRunner.query(`ALTER TABLE duplicate_resolutions DROP CONSTRAINT IF EXISTS "chk_dup_res_order"`);
  }
}
