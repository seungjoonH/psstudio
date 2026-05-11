// 댓글 작성 시점의 제출 버전을 저장하는 컬럼을 추가하는 마이그레이션입니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class CommentsSubmissionVersionNo1783000000000 implements MigrationInterface {
  name = "CommentsSubmissionVersionNo1783000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'comments' AND column_name = 'submission_version_no'
        ) THEN
          ALTER TABLE "comments" ADD COLUMN "submission_version_no" integer NULL;
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
          WHERE table_schema = 'public' AND table_name = 'comments' AND column_name = 'submission_version_no'
        ) THEN
          ALTER TABLE "comments" DROP COLUMN "submission_version_no";
        END IF;
      END $$;
    `);
  }
}
