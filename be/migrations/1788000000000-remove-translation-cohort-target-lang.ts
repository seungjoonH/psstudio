// 집단 분석 데이터를 비우고, 공통 언어·번역 규칙 컬럼을 제거합니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveTranslationCohortTargetLang1788000000000 implements MigrationInterface {
  name = "RemoveTranslationCohortTargetLang1788000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "assignment_cohort_analysis_members"`);
    await queryRunner.query(`DELETE FROM "assignment_cohort_analyses"`);
    await queryRunner.query(`ALTER TABLE "assignment_cohort_analyses" DROP COLUMN IF EXISTS "target_language"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_translation_language"`);
  }

  public async down(): Promise<void> {
    /* 스키마·데이터 복구 불가 — 의도적 no-op */
  }
}
