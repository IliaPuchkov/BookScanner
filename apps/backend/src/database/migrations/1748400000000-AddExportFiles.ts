import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved Excel exports (export/), kept 14 days; each admin sees only their own. userId is SET NULL on
 * user deletion so the cleanup cron still finds the row and removes the stored file.
 */
export class AddExportFiles1748400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "export_files" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid,
        "fileKey" varchar NOT NULL,
        "fileName" varchar NOT NULL,
        "sizeBytes" integer NOT NULL,
        "bookCount" integer NOT NULL,
        "params" jsonb NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "expiresAt" timestamp NOT NULL,
        CONSTRAINT "pk_export_files" PRIMARY KEY ("id"),
        CONSTRAINT "fk_export_files_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_export_files_user_created" ON "export_files" ("userId", "createdAt")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_export_files_expires" ON "export_files" ("expiresAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "export_files"`);
  }
}
