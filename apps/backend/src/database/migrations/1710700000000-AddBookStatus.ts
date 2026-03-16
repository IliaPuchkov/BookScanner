import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookStatus1710700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "book_status_enum" AS ENUM ('pending_review', 'published')
    `);

    await queryRunner.query(`
      ALTER TABLE "books" ADD "status" "book_status_enum" NOT NULL DEFAULT 'pending_review'
    `);

    await queryRunner.query(`
      UPDATE "books" SET "status" = 'published' WHERE "publishedToOzon" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_books_status" ON "books" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_books_status"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "book_status_enum"`);
  }
}
