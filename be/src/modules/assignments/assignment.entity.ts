// 과제 엔티티입니다.
import type { ProblemPlatform } from "@psstudio/shared";
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "assignments" })
@Index(["groupId", "dueAt"])
export class Assignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "description_plain", type: "text", default: "" })
  hintPlain!: string;

  @Column({ name: "problem_url", type: "text" })
  problemUrl!: string;

  @Column({ type: "varchar", length: 32 })
  platform!: ProblemPlatform;

  @Column({ type: "varchar", length: 50, nullable: true })
  difficulty!: string | null;

  @Column({ name: "due_at", type: "timestamptz" })
  dueAt!: Date;

  @Column({ name: "allow_late_submission", type: "boolean", default: true })
  allowLateSubmission!: boolean;

  @Column({ name: "created_by_user_id", type: "uuid" })
  createdByUserId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
