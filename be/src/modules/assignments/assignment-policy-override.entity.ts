// 과제별 피드백 공개 정책 override 엔티티입니다.
import type { FeedbackPolicy } from "@psstudio/shared";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "assignment_policy_overrides" })
@Index(["assignmentId"], { unique: true })
export class AssignmentPolicyOverride {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "assignment_id", type: "uuid" })
  assignmentId!: string;

  @Column({ name: "feedback_policy_override", type: "jsonb" })
  feedbackPolicyOverride!: Partial<FeedbackPolicy>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
