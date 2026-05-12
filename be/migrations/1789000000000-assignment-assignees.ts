// 과제 대상자 스냅샷 테이블을 추가하고 기존 과제를 현재 그룹 멤버로 백필합니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AssignmentAssignees1789000000000 implements MigrationInterface {
  name = "AssignmentAssignees1789000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assignment_assignees" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_assignment_assignees_assignment_user" ON "assignment_assignees" ("assignment_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_assignment_assignees_assignment" ON "assignment_assignees" ("assignment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_assignment_assignees_user" ON "assignment_assignees" ("user_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "assignment_assignees"
      ADD CONSTRAINT "FK_assignment_assignees_assignment"
      FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "assignment_assignees"
      ADD CONSTRAINT "FK_assignment_assignees_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      INSERT INTO "assignment_assignees" ("assignment_id", "user_id")
      SELECT a."id", gm."user_id"
      FROM "assignments" a
      INNER JOIN "group_members" gm
        ON gm."group_id" = a."group_id"
       AND gm."left_at" IS NULL
      WHERE a."deleted_at" IS NULL
      ON CONFLICT ("assignment_id", "user_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_assignees" DROP CONSTRAINT IF EXISTS "FK_assignment_assignees_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_assignees" DROP CONSTRAINT IF EXISTS "FK_assignment_assignees_assignment"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assignment_assignees_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assignment_assignees_assignment"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assignment_assignees_assignment_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assignment_assignees"`);
  }
}
