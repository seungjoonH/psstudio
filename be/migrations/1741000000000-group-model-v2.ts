// 그룹 확장 컬럼·영구 초대 링크·이메일 초대 테이블을 추가하고 구 초대/피드백 정책 테이블을 제거합니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class GroupModelV21741000000000 implements MigrationInterface {
  name = "GroupModelV21741000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "is_system_bot" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "max_members" int NOT NULL DEFAULT 10
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "group_code" varchar(8) COLLATE "C"
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "join_by_code_enabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "join_by_link_enabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "join_by_request_enabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "join_by_email_enabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_use_deadline" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_default_deadline_time" varchar(8) NOT NULL DEFAULT '23:59'
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_allow_late_submission" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_use_ai_feedback" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_translation_language" varchar(32) NOT NULL DEFAULT 'none'
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_allow_edit_after_submit" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "rule_assignment_creator_roles" varchar(32) NOT NULL DEFAULT 'OWNER_AND_MANAGER'
    `);
    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "member_count" int NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "groups" g
      SET "group_code" = ic."code"
      FROM "invite_codes" ic
      WHERE ic."group_id" = g."id"
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        rec RECORD;
        cand text;
        attempt int;
      BEGIN
        FOR rec IN SELECT id FROM groups WHERE group_code IS NULL LOOP
          attempt := 0;
          LOOP
            SELECT string_agg(
              substr(
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
                1 + floor(random() * 62)::int,
                1
              ),
              ''
            ) INTO cand
            FROM generate_series(1, 8);
            EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE group_code = cand);
            attempt := attempt + 1;
            EXIT WHEN attempt > 200;
          END LOOP;
          IF attempt > 200 THEN
            RAISE EXCEPTION 'could not allocate unique group_code';
          END IF;
          UPDATE groups SET group_code = cand WHERE id = rec.id;
        END LOOP;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "groups" ALTER COLUMN "group_code" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_groups_group_code" ON "groups" ("group_code")
    `);

    await queryRunner.query(`
      UPDATE "groups" g
      SET "member_count" = sub.cnt
      FROM (
        SELECT "group_id", count(*)::int AS cnt
        FROM "group_members"
        WHERE "left_at" IS NULL
        GROUP BY "group_id"
      ) sub
      WHERE sub."group_id" = g."id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "group_feedback_policies" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invite_links" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invite_codes" CASCADE`);

    await queryRunner.query(`
      CREATE TABLE "group_invite_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL REFERENCES "groups" ("id") ON DELETE CASCADE,
        "token" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_gil_token" ON "group_invite_links" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gil_group" ON "group_invite_links" ("group_id")`,
    );
    await queryRunner.query(`
      INSERT INTO "group_invite_links" ("group_id", "token")
      SELECT "id", replace(gen_random_uuid()::text, '-', '')
      FROM "groups"
    `);

    await queryRunner.query(`
      CREATE TABLE "group_email_invites" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL REFERENCES "groups" ("id") ON DELETE CASCADE,
        "invited_by_user_id" uuid NOT NULL REFERENCES "users" ("id"),
        "email" varchar(320) NOT NULL,
        "token" varchar(128) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "accepted_at" timestamptz NULL,
        "accepted_user_id" uuid NULL REFERENCES "users" ("id"),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_gei_token" ON "group_email_invites" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gei_group_email" ON "group_email_invites" ("group_id", "email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "group_email_invites" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "group_invite_links" CASCADE`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_groups_group_code"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "member_count"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_assignment_creator_roles"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_allow_edit_after_submit"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_translation_language"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_use_ai_feedback"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_allow_late_submission"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_default_deadline_time"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "rule_use_deadline"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "join_by_email_enabled"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "join_by_request_enabled"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "join_by_link_enabled"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "join_by_code_enabled"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "group_code"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "max_members"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_system_bot"`);

    await queryRunner.query(`
      CREATE TABLE "group_feedback_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "feedback_policy" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_gfp_group" ON "group_feedback_policies" ("group_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invite_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "token" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "max_uses" int NOT NULL,
        "used_count" int NOT NULL DEFAULT 0,
        "created_by_user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invite_links_token" ON "invite_links" ("token")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invite_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "code" varchar(8) COLLATE "C" NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invite_codes_group" ON "invite_codes" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invite_codes_code" ON "invite_codes" ("code")`,
    );
  }
}
