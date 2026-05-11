// 그룹 커뮤니티 게시글 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "community_posts" })
@Index(["groupId", "createdAt"])
export class CommunityPost {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "author_user_id", type: "uuid" })
  authorUserId!: string;

  @Column({ type: "varchar", length: 32, default: "free" })
  category!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "body_markdown", type: "text" })
  bodyMarkdown!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
