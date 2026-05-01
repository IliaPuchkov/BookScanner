import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPriceReviewedToBooks1711300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "books"
      ADD COLUMN "price_reviewed" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "books" DROP COLUMN "price_reviewed"
    `);
  }
}
