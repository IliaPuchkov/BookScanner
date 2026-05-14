import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookIsCopyMaster1747200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "books" ADD COLUMN "isCopyMaster" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN "isCopyMaster"`);
  }
}
