// 코드 리뷰 답글 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "review_replies" })
@Index(["reviewId"])
export class ReviewReply {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "review_id", type: "uuid" })
  reviewId!: string;

  @Column({ name: "parent_reply_id", type: "uuid", nullable: true })
  parentReplyId!: string | null;

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
