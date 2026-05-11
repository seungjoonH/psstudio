// 과제와 제출 댓글 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "comments" })
@Index(["assignmentId"])
@Index(["submissionId"])
@Index(["parentCommentId"])
export class Comment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "assignment_id", type: "uuid", nullable: true })
  assignmentId!: string | null;

  @Column({ name: "submission_id", type: "uuid", nullable: true })
  submissionId!: string | null;

  @Column({ name: "submission_version_no", type: "int", nullable: true })
  submissionVersionNo!: number | null;

  @Column({ name: "parent_comment_id", type: "uuid", nullable: true })
  parentCommentId!: string | null;

  @Column({ name: "author_user_id", type: "uuid" })
  authorUserId!: string;

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
