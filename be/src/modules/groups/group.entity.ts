// 스터디 그룹 엔티티입니다.
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "groups" })
export class Group {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20 })
  name!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ name: "owner_user_id", type: "uuid" })
  ownerUserId!: string;

  @Column({ name: "max_members", type: "int", default: 10 })
  maxMembers!: number;

  @Column({ name: "group_code", type: "varchar", length: 8, collation: "C" })
  groupCode!: string;

  @Column({ name: "join_by_code_enabled", type: "boolean", default: true })
  joinByCodeEnabled!: boolean;

  @Column({ name: "join_by_link_enabled", type: "boolean", default: true })
  joinByLinkEnabled!: boolean;

  @Column({ name: "join_by_request_enabled", type: "boolean", default: true })
  joinByRequestEnabled!: boolean;

  @Column({ name: "join_by_email_enabled", type: "boolean", default: true })
  joinByEmailEnabled!: boolean;

  @Column({ name: "rule_use_deadline", type: "boolean", default: false })
  ruleUseDeadline!: boolean;

  @Column({ name: "rule_default_deadline_time", type: "varchar", length: 8, default: "23:59" })
  ruleDefaultDeadlineTime!: string;

  @Column({ name: "rule_allow_late_submission", type: "boolean", default: true })
  ruleAllowLateSubmission!: boolean;

  @Column({ name: "rule_use_ai_feedback", type: "boolean", default: true })
  ruleUseAiFeedback!: boolean;

  @Column({ name: "rule_allow_edit_after_submit", type: "boolean", default: true })
  ruleAllowEditAfterSubmit!: boolean;

  @Column({ name: "rule_assignment_creator_roles", type: "varchar", length: 32, default: "OWNER_AND_MANAGER" })
  ruleAssignmentCreatorRoles!: string;

  @Column({ name: "member_count", type: "int", default: 0 })
  memberCount!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
