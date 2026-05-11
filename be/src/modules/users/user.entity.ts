// 사용자 계정 엔티티입니다.
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "users" })
@Index(["provider", "providerUserId"], { unique: true })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 16 })
  provider!: "google" | "github" | "system";

  @Column({ name: "is_system_bot", type: "boolean", default: false })
  isSystemBot!: boolean;

  @Column({ name: "provider_user_id", type: "varchar", length: 255 })
  providerUserId!: string;

  @Column({ type: "varchar", length: 320 })
  email!: string;

  @Column({ type: "varchar", length: 100 })
  nickname!: string;

  @Column({ name: "profile_image_url", type: "text" })
  profileImageUrl!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
