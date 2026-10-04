import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { buildCopySets } from '../../books/duplicate-matching';

// Gives every confirmed copy (isCopy=true) a copy set. Copies marked before 1747700000000 had no
// copyGroupId and were grouped on the Copies screen by raw ISBN text / title, which split pairs
// like (no ISBN, OCR junk "2313") into two one-book groups. Sets are rebuilt with the duplicate
// matching rules (buildCopySets); books that already have a set keep its id.
// Not reversible: down() leaves the ids in place (they are harmless to the old code).
export class BackfillCopyGroupIds1747800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ id: string; isbn: string | null; title: string | null; author: string | null; copyGroupId: string | null }> =
      await queryRunner.query(
        `SELECT id::text AS id, isbn, title, author, "copyGroupId"::text AS "copyGroupId" FROM books WHERE "isCopy" = true`,
      );
    const byId = new Map(rows.map((r) => [r.id, r]));

    let changed = 0;
    for (const ids of buildCopySets(rows)) {
      const existing = [...new Set(ids.map((id) => byId.get(id)!.copyGroupId).filter((g): g is string => !!g))].sort();
      const target = existing[0] ?? randomUUID();
      const toUpdate = ids.filter((id) => byId.get(id)!.copyGroupId !== target);
      if (!toUpdate.length) continue;
      await queryRunner.query(`UPDATE books SET "copyGroupId" = $1 WHERE id = ANY($2::uuid[])`, [target, toUpdate]);
      changed += toUpdate.length;
    }
    console.log(`[BackfillCopyGroupIds] copies=${rows.length} updated=${changed}`);
  }

  public async down(): Promise<void> {
    // no-op, see above
  }
}
