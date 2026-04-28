import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrintRunToBooks1711100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "printRun" integer NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "books" DROP COLUMN IF EXISTS "printRun"
    `);
  }
}
