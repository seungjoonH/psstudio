// 공지와 커뮤니티 게시글의 공용 댓글 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "post_comments" })
@Index(["announcementId"])
@Index(["communityPostId"])
@Index(["parentCommentId"])
export class PostComment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "announcement_id", type: "uuid", nullable: true })
  announcementId!: string | null;

  @Column({ name: "community_post_id", type: "uuid", nullable: true })
  communityPostId!: string | null;

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
