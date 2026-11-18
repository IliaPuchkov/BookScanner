import { MigrationInterface, QueryRunner } from 'typeorm';

/** When a book's Ozon rich content (attribute 11254) was sent; the push cron looks for published books without it. */
export class AddBookRichContentSyncedAt1748200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "richContentSyncedAt" timestamp`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_rich_content_unsynced" ON "books" ("id")
      WHERE "richContentSyncedAt" IS NULL AND "status" = 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_rich_content_unsynced"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "richContentSyncedAt"`);
  }
}
