// 과제 단위 집단 코드 비교 분석 실행 상태와 결과를 저장하는 엔티티입니다.
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Assignment } from "./assignment.entity.js";
import { User } from "../users/user.entity.js";

@Entity({ name: "assignment_cohort_analyses" })
@Index(["status"])
export class AssignmentCohortAnalysis {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "assignment_id", type: "uuid", unique: true })
  assignmentId!: string;

  @ManyToOne(() => Assignment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "assignment_id" })
  assignment!: Assignment;

  @Column({ type: "varchar", length: 16 })
  status!: "RUNNING" | "DONE" | "FAILED";

  @Column({ name: "report_locale", type: "varchar", length: 16, nullable: true })
  reportLocale!: string | null;

  @Column({ name: "triggered_by_user_id", type: "uuid" })
  triggeredByUserId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "triggered_by_user_id" })
  triggeredByUser!: User;

  @Column({ name: "token_used", type: "int", default: 0 })
  tokenUsed!: number;

  @Column({ name: "report_markdown", type: "text", nullable: true })
  reportMarkdown!: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  artifacts!: Record<string, unknown>;

  @Column({ name: "failure_reason", type: "text", nullable: true })
  failureReason!: string | null;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
