import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookLibrary1747600000000 implements MigrationInterface {
  // ALTER TYPE ... ADD VALUE cannot run inside a transaction block
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "books_status_enum" ADD VALUE IF NOT EXISTS 'in_library'`);
    await queryRunner.query(`
      ALTER TABLE "books"
        ADD COLUMN IF NOT EXISTS "libraryOwnerId" uuid NULL
          REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "addedToLibraryAt" timestamp NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_books_libraryOwnerId" ON "books" ("libraryOwnerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "books" SET "status" = 'pending_review' WHERE "status" = 'in_library'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_books_libraryOwnerId"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "addedToLibraryAt"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "libraryOwnerId"`);
    // PostgreSQL does not support removing enum values
  }
}
