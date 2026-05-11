// 그룹 영구 초대 링크 토큰을 저장합니다. 그룹 코드 재발급 시 무효화됩니다.
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "group_invite_links" })
@Index(["token"], { unique: true })
export class GroupInviteLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ type: "varchar", length: 64 })
  token!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;
}
