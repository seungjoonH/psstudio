// init 마이그레이션은 assignments에 hint_plain만 두었고, 이후 1765는 description_plain이 있을 때만 rename합니다.
// 로컬 DB에는 hint_plain만 남아 Assignment 엔티티(description_plain)와 불일치하므로 컬럼명을 맞춥니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AssignmentsHintPlainToDescriptionPlain1781000000000 implements MigrationInterface {
  name = "AssignmentsHintPlainToDescriptionPlain1781000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'hint_plain'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'description_plain'
        ) THEN
          ALTER TABLE "assignments" RENAME COLUMN "hint_plain" TO "description_plain";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'description_plain'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'hint_plain'
        ) THEN
          ALTER TABLE "assignments" RENAME COLUMN "description_plain" TO "hint_plain";
        END IF;
      END $$;
    `);
  }
}
