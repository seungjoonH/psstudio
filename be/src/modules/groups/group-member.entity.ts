// 그룹 멤버 관계와 역할을 저장하는 엔티티입니다.
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type GroupRoleValue = "OWNER" | "MANAGER" | "MEMBER";

@Entity({ name: "group_members" })
@Index(["groupId", "userId"], { unique: true })
@Index(["userId"])
export class GroupMember {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 16 })
  role!: GroupRoleValue;

  @CreateDateColumn({ name: "joined_at", type: "timestamptz" })
  joinedAt!: Date;

  @Column({ name: "left_at", type: "timestamptz", nullable: true })
  leftAt!: Date | null;
}
