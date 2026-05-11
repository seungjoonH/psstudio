// 그룹 가입 신청 엔티티입니다.
import type { JoinRequestStatus } from "@psstudio/shared";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "join_requests" })
@Index(["groupId", "status"])
@Index(["groupId", "userId"])
export class JoinRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 16 })
  status!: JoinRequestStatus;

  @Column({ name: "decided_by", type: "uuid", nullable: true })
  decidedBy!: string | null;

  @Column({ name: "decided_at", type: "timestamptz", nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
