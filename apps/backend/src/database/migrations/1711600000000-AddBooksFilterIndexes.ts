import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBooksFilterIndexes1711600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // FK columns — PostgreSQL does not auto-index referencing side
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_created_by" ON "books"("created_by")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_box_id" ON "books"("box_id")
    `);

    // ISBN duplicate group query: GROUP BY isbn WHERE isbn IS NOT NULL AND isbn != ''
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_isbn" ON "books"("isbn")
      WHERE "isbn" IS NOT NULL AND "isbn" != ''
    `);

    // Trigram index for LIKE search on title and author (requires pg_trgm)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_title_trgm" ON "books"
      USING GIN (LOWER("title") gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_author_trgm" ON "books"
      USING GIN (LOWER("author") gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_created_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_box_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_isbn"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_title_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_author_trgm"`);
  }
}
