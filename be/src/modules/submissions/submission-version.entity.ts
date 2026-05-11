// 제출 코드 버전 엔티티입니다.
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "submission_versions" })
@Index(["submissionId", "versionNo"], { unique: true })
export class SubmissionVersion {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ name: "version_no", type: "int" })
  versionNo!: number;

  @Column({ type: "varchar", length: 50 })
  language!: string;

  @Column({ type: "text" })
  code!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
