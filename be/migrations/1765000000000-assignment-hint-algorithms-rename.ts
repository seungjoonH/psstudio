// 과제 힌트/알고리즘 메타데이터 명칭을 일괄 전환하는 마이그레이션입니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AssignmentHintAlgorithmsRename1765000000000 implements MigrationInterface {
  name = "AssignmentHintAlgorithmsRename1765000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'assignments' AND column_name = 'description_plain'
        ) THEN
          ALTER TABLE "assignments" RENAME COLUMN "description_plain" TO "hint_plain";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE "problem_analyses"
      SET "metadata" = jsonb_set(
        jsonb_set(
          CASE
            WHEN "metadata" ? 'algorithmTags'
              THEN ("metadata" - 'algorithmTags') || jsonb_build_object('algorithms', "metadata"->'algorithmTags')
            ELSE "metadata"
          END,
          '{hintHiddenUntilSubmit}',
          COALESCE("metadata"->'hintHiddenUntilSubmit', 'true'::jsonb),
          true
        ),
        '{algorithmsHiddenUntilSubmit}',
        COALESCE("metadata"->'algorithmsHiddenUntilSubmit', "metadata"->'algorithmHiddenUntilSubmit', 'true'::jsonb),
        true
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'assignments' AND column_name = 'hint_plain'
        ) THEN
          ALTER TABLE "assignments" RENAME COLUMN "hint_plain" TO "description_plain";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE "problem_analyses"
      SET "metadata" = (
        CASE
          WHEN "metadata" ? 'algorithms'
            THEN ("metadata" - 'algorithms') || jsonb_build_object('algorithmTags', "metadata"->'algorithms')
          ELSE "metadata"
        END
      ) - 'algorithmsHiddenUntilSubmit';
    `);
  }
}
