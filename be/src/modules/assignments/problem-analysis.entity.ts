// 문제 메타데이터 분석 결과 엔티티입니다.
import type { ProblemAnalysisStatus } from "@psstudio/shared";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type ProblemMetadata = {
  title?: string;
  difficulty?: string;
  algorithms?: string[];
  rawNotes?: string;
  hintHiddenUntilSubmit?: boolean;
  algorithmsHiddenUntilSubmit?: boolean;
};

@Entity({ name: "problem_analyses" })
@Index(["assignmentId"], { unique: true })
export class ProblemAnalysis {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "assignment_id", type: "uuid" })
  assignmentId!: string;

  @Column({ type: "varchar", length: 16 })
  status!: ProblemAnalysisStatus;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metadata!: ProblemMetadata;

  @Column({ name: "analyzed_at", type: "timestamptz", nullable: true })
  analyzedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
