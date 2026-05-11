// 집단 코드 비교 리포트 생성 로케일 컬럼을 추가합니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AssignmentCohortReportLocale1785000000000 implements MigrationInterface {
  name = "AssignmentCohortReportLocale1785000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assignment_cohort_analyses"
      ADD COLUMN "report_locale" varchar(16) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assignment_cohort_analyses"
      DROP COLUMN "report_locale"
    `);
  }
}
