import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ozon video cover per book: where it is stored, which photos it was made from, when it reached Ozon. */
export class AddBookVideoCover1748100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "books"
        ADD COLUMN IF NOT EXISTS "videoCoverUrl" varchar,
        ADD COLUMN IF NOT EXISTS "videoCoverKey" varchar,
        ADD COLUMN IF NOT EXISTS "videoCoverHash" varchar(16),
        ADD COLUMN IF NOT EXISTS "videoCoverSyncedAt" timestamp
    `);
    // the push cron looks for covers not yet sent to Ozon
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_books_video_cover_unsynced" ON "books" ("id")
      WHERE "videoCoverUrl" IS NOT NULL AND "videoCoverSyncedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_books_video_cover_unsynced"`);
    await queryRunner.query(`
      ALTER TABLE "books"
        DROP COLUMN IF EXISTS "videoCoverSyncedAt",
        DROP COLUMN IF EXISTS "videoCoverHash",
        DROP COLUMN IF EXISTS "videoCoverKey",
        DROP COLUMN IF EXISTS "videoCoverUrl"
    `);
  }
}
