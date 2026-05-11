// 과제 집단 코드 비교 분석 결과를 저장하는 테이블을 추가하는 마이그레이션입니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AssignmentCohortAnalyses1784000000000 implements MigrationInterface {
  name = "AssignmentCohortAnalyses1784000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assignment_cohort_analyses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "target_language" varchar(32) NOT NULL,
        "triggered_by_user_id" uuid NOT NULL,
        "token_used" int NOT NULL DEFAULT 0,
        "report_markdown" text NULL,
        "artifacts" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "failure_reason" text NULL,
        "started_at" timestamptz NULL,
        "finished_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_aca_assignment" UNIQUE ("assignment_id"),
        CONSTRAINT "FK_aca_assignment" FOREIGN KEY ("assignment_id") REFERENCES "assignments" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_aca_user" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_aca_status" ON "assignment_cohort_analyses" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "assignment_cohort_analysis_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cohort_analysis_id" uuid NOT NULL,
        "submission_id" uuid NOT NULL,
        "submission_version_id" uuid NOT NULL,
        CONSTRAINT "UQ_acam_cohort_submission" UNIQUE ("cohort_analysis_id", "submission_id"),
        CONSTRAINT "FK_acam_cohort" FOREIGN KEY ("cohort_analysis_id") REFERENCES "assignment_cohort_analyses" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_acam_submission" FOREIGN KEY ("submission_id") REFERENCES "submissions" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_acam_version" FOREIGN KEY ("submission_version_id") REFERENCES "submission_versions" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_acam_cohort" ON "assignment_cohort_analysis_members" ("cohort_analysis_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "assignment_cohort_analysis_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assignment_cohort_analyses"`);
  }
}
