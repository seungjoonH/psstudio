// 과제 대상자 스냅샷을 저장하는 엔티티입니다.
import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Column, Unique } from "typeorm";
import { User } from "../users/user.entity.js";
import { Assignment } from "./assignment.entity.js";

@Entity({ name: "assignment_assignees" })
@Unique(["assignmentId", "userId"])
@Index(["assignmentId"])
@Index(["userId"])
export class AssignmentAssignee {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "assignment_id", type: "uuid" })
  assignmentId!: string;

  @ManyToOne(() => Assignment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "assignment_id" })
  assignment!: Assignment;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
