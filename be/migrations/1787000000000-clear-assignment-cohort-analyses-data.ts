// 저장된 집단 코드 비교 결과 행을 다시 비운니다(member 행은 FK CASCADE로 함께 삭제됩니다).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class ClearAssignmentCohortAnalysesData1787000000000 implements MigrationInterface {
  name = "ClearAssignmentCohortAnalysesData1787000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "assignment_cohort_analyses"`);
  }

  public async down(): Promise<void> {
    /* 데이터 복구 불가 — 의도적 no-op */
  }
}
