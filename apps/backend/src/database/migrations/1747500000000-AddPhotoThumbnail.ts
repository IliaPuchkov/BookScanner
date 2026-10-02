import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhotoThumbnail1747500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Small cover thumbnail for list screens, generated lazily the first time
    // a cover is loaded (see ThumbnailService).
    await queryRunner.query(`
      ALTER TABLE "book_photos"
        ADD COLUMN IF NOT EXISTS "thumbnailUrl" varchar NULL,
        ADD COLUMN IF NOT EXISTS "thumbnailKey" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "book_photos"
        DROP COLUMN IF EXISTS "thumbnailUrl",
        DROP COLUMN IF EXISTS "thumbnailKey"
    `);
  }
}
