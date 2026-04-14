import { MigrationInterface, QueryRunner } from 'typeorm';

export class BoxNumberUniquePerUser1710800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old global unique constraint on box_number
    await queryRunner.query(`
      ALTER TABLE "boxes" DROP CONSTRAINT IF EXISTS "UQ_boxes_box_number"
    `);
    // Also drop any remaining single-column unique constraint on boxNumber
    await queryRunner.query(`
      DO $$
      DECLARE
        cname text;
      BEGIN
        SELECT tc.constraint_name INTO cname
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'boxes'
          AND tc.constraint_type = 'UNIQUE'
          AND ccu.column_name = 'boxNumber'
          AND tc.constraint_name != 'UQ_boxes_box_number_created_by';
        IF cname IS NOT NULL THEN
          EXECUTE 'ALTER TABLE boxes DROP CONSTRAINT ' || quote_ident(cname);
        END IF;
      END $$;
    `);

    // Add composite unique constraint (boxNumber + created_by)
    await queryRunner.query(`
      ALTER TABLE "boxes"
        ADD CONSTRAINT "UQ_boxes_box_number_created_by"
        UNIQUE ("boxNumber", "created_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "boxes" DROP CONSTRAINT IF EXISTS "UQ_boxes_box_number_created_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "boxes"
        ADD CONSTRAINT "UQ_boxes_box_number"
        UNIQUE ("boxNumber")
    `);
  }
}
