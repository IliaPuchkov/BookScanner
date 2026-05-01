import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDuplicateResolutions1711200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "duplicate_resolutions" (
        "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "book1_id" uuid NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
        "book2_id" uuid NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
        "resolved_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "resolved_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_dup_pair" CHECK ("book1_id" < "book2_id"),
        UNIQUE ("book1_id", "book2_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_dup_res_book1" ON "duplicate_resolutions"("book1_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_dup_res_book2" ON "duplicate_resolutions"("book2_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "duplicate_resolutions"`);
  }
}
