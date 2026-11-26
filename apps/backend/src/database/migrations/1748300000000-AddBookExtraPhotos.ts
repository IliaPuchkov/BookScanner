import { MigrationInterface, QueryRunner } from 'typeorm';

/** Generated extra photos for Ozon (ozon/extra-photos); the push cron looks for published books without them. */
export class AddBookExtraPhotos1748300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "extraPhotosUrls" jsonb`);
    await queryRunner.query(`ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "extraPhotosHash" varchar(16)`);
    await queryRunner.query(`ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "extraPhotosSyncedAt" timestamp`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_extra_photos_unsynced" ON "books" ("id")
      WHERE "extraPhotosSyncedAt" IS NULL AND "status" = 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_extra_photos_unsynced"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "extraPhotosSyncedAt"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "extraPhotosHash"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "extraPhotosUrls"`);
  }
}
