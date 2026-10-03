import { MigrationInterface, QueryRunner } from 'typeorm';

// Explicit copy-set id: one suspected duplicate group can be split into several copy sets
// (A+A', B+B'), which share an ISBN/title and so can't be told apart by those fields.
export class AddBookCopyGroupId1747700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" ADD COLUMN "copyGroupId" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_books_copy_group_id" ON "books" ("copyGroupId") WHERE "copyGroupId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_copy_group_id"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN "copyGroupId"`);
  }
}
