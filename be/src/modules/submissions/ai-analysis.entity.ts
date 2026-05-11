// 제출 코드 AI 분석 결과 엔티티입니다.
import type { AiAnalysisStatus } from "@psstudio/shared";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "ai_analyses" })
@Index(["submissionId"], { unique: true })
export class AiAnalysis {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ type: "varchar", length: 16 })
  status!: AiAnalysisStatus;

  @Column({ name: "verified_language", type: "varchar", length: 50, nullable: true })
  verifiedLanguage!: string | null;

  @Column({ name: "algorithm_tags", type: "jsonb", default: () => "'[]'::jsonb" })
  algorithmTags!: string[];

  @Column({ name: "improvement_summary", type: "text", default: "" })
  improvementSummary!: string;

  @Column({ name: "complexity_summary", type: "text", default: "" })
  complexitySummary!: string;

  @Column({ name: "edge_case_suggestions", type: "text", default: "" })
  edgeCaseSuggestions!: string;

  @Column({ name: "token_used", type: "int", default: 0 })
  tokenUsed!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
