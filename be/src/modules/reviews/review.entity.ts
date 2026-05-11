// 코드 리뷰 엔티티입니다.
import type { ReviewType } from "@psstudio/shared";
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "reviews" })
@Index(["submissionVersionId"])
@Index(["submissionId"])
export class Review {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "assignment_id", type: "uuid" })
  assignmentId!: string;

  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ name: "submission_version_id", type: "uuid" })
  submissionVersionId!: string;

  @Column({ name: "author_user_id", type: "uuid" })
  authorUserId!: string;

  @Column({ name: "review_type", type: "varchar", length: 16 })
  reviewType!: ReviewType;

  @Column({ name: "file_path", type: "varchar", length: 200, nullable: true })
  filePath!: string | null;

  @Column({ name: "start_line", type: "int", nullable: true })
  startLine!: number | null;

  @Column({ name: "end_line", type: "int", nullable: true })
  endLine!: number | null;

  @Column({ type: "text" })
  body!: string;

  @Column({ name: "is_admin_hidden", type: "boolean", default: false })
  isAdminHidden!: boolean;

  @Column({ name: "is_edited", type: "boolean", default: false })
  isEdited!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
