// REACTIONS polymorphic 테이블을 추가하고 review_replies/comments에 답글 응답 인덱스를 보강합니다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReactionsAndReplies1780000000000 implements MigrationInterface {
  name = "ReactionsAndReplies1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "target_type" varchar(32) NOT NULL,
        "target_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "emoji" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reactions_unique" ON "reactions" ("target_type", "target_id", "user_id", "emoji")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reactions_target" ON "reactions" ("target_type", "target_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reactions_user" ON "reactions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reactions" CASCADE`);
  }
}
