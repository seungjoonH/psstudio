// 제출 버전 간 diff 캐시 엔티티입니다.
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "submission_diffs" })
@Index(["submissionId", "fromVersion", "toVersion"], { unique: true })
export class SubmissionDiff {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ name: "from_version", type: "int" })
  fromVersion!: number;

  @Column({ name: "to_version", type: "int" })
  toVersion!: number;

  @Column({ name: "diff_text", type: "text" })
  diffText!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
