import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreIdIndexToOzonProducts1711500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ozon_products_store_id" ON "ozon_products"("storeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ozon_products_store_id"`);
  }
}
