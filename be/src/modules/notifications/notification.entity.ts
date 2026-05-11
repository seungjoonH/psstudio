// 알림 엔티티입니다.
import type { NotificationType } from "@psstudio/shared";
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "notifications" })
@Index(["recipientUserId", "isRead", "createdAt"])
@Index(["recipientUserId", "createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "recipient_user_id", type: "uuid" })
  recipientUserId!: string;

  @Column({ type: "varchar", length: 64 })
  type!: NotificationType;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: "is_read", type: "boolean", default: false })
  isRead!: boolean;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
