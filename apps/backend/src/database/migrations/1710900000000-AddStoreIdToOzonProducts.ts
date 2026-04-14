import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreIdToOzonProducts1710900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ozon_products" ADD COLUMN IF NOT EXISTS "storeId" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ozon_products" DROP COLUMN IF EXISTS "storeId"
    `);
  }
}
