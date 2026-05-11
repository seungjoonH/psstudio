// 그룹 공지 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "announcements" })
@Index(["groupId", "createdAt"])
export class Announcement {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "author_user_id", type: "uuid" })
  authorUserId!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "body_markdown", type: "text" })
  bodyMarkdown!: string;

  @Column({ name: "is_pinned", type: "boolean", default: false })
  isPinned!: boolean;

  @Column({ name: "is_important", type: "boolean", default: false })
  isImportant!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
