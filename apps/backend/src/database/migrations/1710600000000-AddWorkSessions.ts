import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkSessions1710600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "work_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'active',
        "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "endedAt" TIMESTAMP,
        CONSTRAINT "PK_work_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_work_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_work_sessions_user_status" ON "work_sessions" ("user_id", "status")
    `);

    await queryRunner.query(`
      ALTER TABLE "books" ADD "work_session_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "books" ADD CONSTRAINT "FK_books_work_session"
        FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" DROP CONSTRAINT "FK_books_work_session"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN "work_session_id"`);
    await queryRunner.query(`DROP INDEX "IDX_work_sessions_user_status"`);
    await queryRunner.query(`DROP TABLE "work_sessions"`);
  }
}
