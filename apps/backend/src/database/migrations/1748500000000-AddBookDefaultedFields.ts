import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which card fields hold a default (card_defaults setting) rather than a value from the AI or a person:
 * weightGross, width/height/depth (axes of dimensions), paperType, coverType, language, condition,
 * bookType, direction. Older cards start empty — their values count as real.
 */
export class AddBookDefaultedFields1748500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "defaultedFields" text[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "defaultedFields"`);
  }
}
