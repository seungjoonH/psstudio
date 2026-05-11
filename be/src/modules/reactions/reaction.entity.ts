// 댓글류 도메인을 polymorphic으로 묶는 이모지 반응 엔티티입니다.
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export type ReactionTargetType = "review" | "review_reply" | "comment" | "post_comment";

@Entity({ name: "reactions" })
@Index("IDX_reactions_target", ["targetType", "targetId"])
@Index("IDX_reactions_user", ["userId"])
@Index("IDX_reactions_unique", ["targetType", "targetId", "userId", "emoji"], {
  unique: true,
})
export class Reaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "target_type", type: "varchar", length: 32 })
  targetType!: ReactionTargetType;

  @Column({ name: "target_id", type: "uuid" })
  targetId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 64 })
  emoji!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
