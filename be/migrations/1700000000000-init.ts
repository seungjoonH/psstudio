// 초기 PS Studio 스키마를 한 번에 생성하는 마이그레이션입니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class Init1700000000000 implements MigrationInterface {
  name = "Init1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider" varchar(16) NOT NULL,
        "provider_user_id" varchar(255) NOT NULL,
        "email" varchar(320) NOT NULL,
        "nickname" varchar(100) NOT NULL,
        "profile_image_url" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_provider_pid" ON "users" ("provider", "provider_user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(20) NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "group_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(16) NOT NULL,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        "left_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_gm_group_user" ON "group_members" ("group_id", "user_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_gm_user" ON "group_members" ("user_id")`);

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

    await queryRunner.query(`
      CREATE TABLE "join_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "decided_by" uuid NULL,
        "decided_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_jr_group_status" ON "join_requests" ("group_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jr_group_user" ON "join_requests" ("group_id", "user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "hint_plain" text NOT NULL DEFAULT '',
        "problem_url" text NOT NULL,
        "platform" varchar(32) NOT NULL,
        "difficulty" varchar(50) NULL,
        "due_at" timestamptz NOT NULL,
        "allow_late_submission" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_assignments_group_due" ON "assignments" ("group_id", "due_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "assignment_policy_overrides" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL,
        "feedback_policy_override" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_apo_assignment" ON "assignment_policy_overrides" ("assignment_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "problem_analyses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "analyzed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_pa_assignment" ON "problem_analyses" ("assignment_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "submissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL,
        "author_user_id" uuid NOT NULL,
        "title" varchar(100) NOT NULL,
        "language" varchar(50) NOT NULL,
        "latest_code" text NOT NULL,
        "is_late" boolean NOT NULL DEFAULT false,
        "current_version_no" int NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sub_a_au_c" ON "submissions" ("assignment_id", "author_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sub_a_c" ON "submissions" ("assignment_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "submission_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "submission_id" uuid NOT NULL,
        "version_no" int NOT NULL,
        "language" varchar(50) NOT NULL,
        "code" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_sv_sub_ver" ON "submission_versions" ("submission_id", "version_no")`,
    );

    await queryRunner.query(`
      CREATE TABLE "submission_diffs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "submission_id" uuid NOT NULL,
        "from_version" int NOT NULL,
        "to_version" int NOT NULL,
        "diff_text" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_sd_sub_from_to" ON "submission_diffs" ("submission_id", "from_version", "to_version")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_analyses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "submission_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "verified_language" varchar(50) NULL,
        "algorithm_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "improvement_summary" text NOT NULL DEFAULT '',
        "complexity_summary" text NOT NULL DEFAULT '',
        "edge_case_suggestions" text NOT NULL DEFAULT '',
        "token_used" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_aia_submission" ON "ai_analyses" ("submission_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "assignment_id" uuid NULL,
        "submission_id" uuid NULL,
        "parent_comment_id" uuid NULL,
        "author_user_id" uuid NOT NULL,
        "body" text NOT NULL,
        "is_admin_hidden" boolean NOT NULL DEFAULT false,
        "is_edited" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_com_assignment" ON "comments" ("assignment_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_com_submission" ON "comments" ("submission_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_com_parent" ON "comments" ("parent_comment_id")`);

    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "assignment_id" uuid NOT NULL,
        "submission_id" uuid NOT NULL,
        "submission_version_id" uuid NOT NULL,
        "author_user_id" uuid NOT NULL,
        "review_type" varchar(16) NOT NULL,
        "file_path" varchar(200) NULL,
        "start_line" int NULL,
        "end_line" int NULL,
        "body" text NOT NULL,
        "is_admin_hidden" boolean NOT NULL DEFAULT false,
        "is_edited" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rev_version" ON "reviews" ("submission_version_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_rev_submission" ON "reviews" ("submission_id")`);

    await queryRunner.query(`
      CREATE TABLE "review_replies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "review_id" uuid NOT NULL,
        "parent_reply_id" uuid NULL,
        "author_user_id" uuid NOT NULL,
        "body" text NOT NULL,
        "is_admin_hidden" boolean NOT NULL DEFAULT false,
        "is_edited" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rr_review" ON "review_replies" ("review_id")`);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "recipient_user_id" uuid NOT NULL,
        "type" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_noti_user_read_c" ON "notifications" ("recipient_user_id", "is_read", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_noti_user_c" ON "notifications" ("recipient_user_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "calendar_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "assignment_id" uuid NOT NULL,
        "event_date" date NOT NULL,
        "status" varchar(16) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cal_group_date" ON "calendar_events" ("group_id", "event_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cal_assignment" ON "calendar_events" ("assignment_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "announcements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "author_user_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "body_markdown" text NOT NULL,
        "is_pinned" boolean NOT NULL DEFAULT false,
        "is_important" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ann_group_c" ON "announcements" ("group_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "community_posts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "author_user_id" uuid NOT NULL,
        "category" varchar(32) NOT NULL DEFAULT 'free',
        "title" varchar(200) NOT NULL,
        "body_markdown" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cp_group_c" ON "community_posts" ("group_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "post_comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL,
        "announcement_id" uuid NULL,
        "community_post_id" uuid NULL,
        "parent_comment_id" uuid NULL,
        "author_user_id" uuid NOT NULL,
        "body" text NOT NULL,
        "is_admin_hidden" boolean NOT NULL DEFAULT false,
        "is_edited" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pc_announcement" ON "post_comments" ("announcement_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pc_community" ON "post_comments" ("community_post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pc_parent" ON "post_comments" ("parent_comment_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_token_balances" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "balance_tokens" int NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_aitb_user" ON "ai_token_balances" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      "ai_token_balances",
      "post_comments",
      "community_posts",
      "announcements",
      "calendar_events",
      "notifications",
      "review_replies",
      "reviews",
      "comments",
      "ai_analyses",
      "submission_diffs",
      "submission_versions",
      "submissions",
      "problem_analyses",
      "assignment_policy_overrides",
      "assignments",
      "join_requests",
      "invite_codes",
      "invite_links",
      "group_feedback_policies",
      "group_members",
      "groups",
      "users",
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  }
}
