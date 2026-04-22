import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchivedBookStatus1711000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "books_status_enum" ADD VALUE IF NOT EXISTS 'archived'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values
  }
}
