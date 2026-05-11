// 제출 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "submissions" })
@Index(["assignmentId", "authorUserId", "createdAt"])
@Index(["assignmentId", "createdAt"])
export class Submission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "assignment_id", type: "uuid" })
  assignmentId!: string;

  @Column({ name: "author_user_id", type: "uuid" })
  authorUserId!: string;

  @Column({ type: "varchar", length: 100 })
  title!: string;

  @Column({ type: "varchar", length: 50 })
  language!: string;

  @Column({ name: "latest_code", type: "text" })
  latestCode!: string;

  @Column({ name: "note_markdown", type: "text", default: "" })
  noteMarkdown!: string;

  @Column({ name: "is_late", type: "boolean", default: false })
  isLate!: boolean;

  @Column({ name: "current_version_no", type: "int", default: 1 })
  currentVersionNo!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
