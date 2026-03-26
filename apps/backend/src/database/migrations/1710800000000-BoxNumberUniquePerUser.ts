import { MigrationInterface, QueryRunner } from 'typeorm';

export class BoxNumberUniquePerUser1710800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old global unique constraint on box_number
    await queryRunner.query(`
      ALTER TABLE "boxes" DROP CONSTRAINT IF EXISTS "UQ_boxes_box_number"
    `);
    // Also drop auto-generated constraint name variants
    await queryRunner.query(`
      DO $$
      DECLARE
        cname text;
      BEGIN
        SELECT constraint_name INTO cname
        FROM information_schema.table_constraints
        WHERE table_name = 'boxes'
          AND constraint_type = 'UNIQUE'
          AND constraint_name NOT LIKE '%box_number%created_by%'
          AND constraint_name NOT LIKE '%created_by%box_number%';
        IF cname IS NOT NULL THEN
          EXECUTE 'ALTER TABLE boxes DROP CONSTRAINT ' || quote_ident(cname);
        END IF;
      END $$;
    `);

    // Add composite unique constraint (box_number + created_by)
    await queryRunner.query(`
      ALTER TABLE "boxes"
        ADD CONSTRAINT "UQ_boxes_box_number_created_by"
        UNIQUE ("box_number", "created_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "boxes" DROP CONSTRAINT IF EXISTS "UQ_boxes_box_number_created_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "boxes"
        ADD CONSTRAINT "UQ_boxes_box_number"
        UNIQUE ("box_number")
    `);
  }
}
