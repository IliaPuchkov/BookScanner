import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhotoAndSessionFkIndexes1747400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // FK columns — PostgreSQL does not auto-index referencing side.
    // Every book list joins photos and filters on the work session.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_book_photos_book_id" ON "book_photos"("book_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_work_session_id" ON "books"("work_session_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_book_photos_book_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_work_session_id"`);
  }
}
