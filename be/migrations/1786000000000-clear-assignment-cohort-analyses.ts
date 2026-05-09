// 저장된 집단 코드 비교 결과 전체를 삭제합니다(구 형식 데이터 제거).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class ClearAssignmentCohortAnalyses1786000000000 implements MigrationInterface {
  name = "ClearAssignmentCohortAnalyses1786000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "assignment_cohort_analyses"`);
  }

  public async down(): Promise<void> {
    /* 데이터 복구 불가 — 의도적 no-op */
  }
}
