// 캘린더 이벤트 캐시 엔티티입니다.
import type { AssignmentStatus } from "@psstudio/shared";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "calendar_events" })
@Index(["groupId", "eventDate"])
@Index(["assignmentId"])
export class CalendarEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @Column({ name: "assignment_id", type: "uuid" })
  assignmentId!: string;

  @Column({ name: "event_date", type: "date" })
  eventDate!: string;

  @Column({ type: "varchar", length: 16 })
  status!: AssignmentStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
