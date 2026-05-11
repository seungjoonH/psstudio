// submissions.note_markdown 컬럼을 안전하게 추가/제거하는 마이그레이션입니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class SubmissionsNoteMarkdown1782000000000 implements MigrationInterface {
  name = "SubmissionsNoteMarkdown1782000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'note_markdown'
        ) THEN
          ALTER TABLE "submissions" ADD COLUMN "note_markdown" text NOT NULL DEFAULT '';
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
          WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'note_markdown'
        ) THEN
          ALTER TABLE "submissions" DROP COLUMN "note_markdown";
        END IF;
      END $$;
    `);
  }
}
