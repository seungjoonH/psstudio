// 집단 코드 비교 분석 성공 시 포함된 제출 버전 스냅샷을 저장하는 엔티티입니다.
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { Submission } from "../submissions/submission.entity.js";
import { SubmissionVersion } from "../submissions/submission-version.entity.js";
import { AssignmentCohortAnalysis } from "./assignment-cohort-analysis.entity.js";

@Entity({ name: "assignment_cohort_analysis_members" })
@Unique(["cohortAnalysisId", "submissionId"])
@Index(["cohortAnalysisId"])
export class AssignmentCohortAnalysisMember {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "cohort_analysis_id", type: "uuid" })
  cohortAnalysisId!: string;

  @ManyToOne(() => AssignmentCohortAnalysis, { onDelete: "CASCADE" })
  @JoinColumn({ name: "cohort_analysis_id" })
  cohortAnalysis!: AssignmentCohortAnalysis;

  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @ManyToOne(() => Submission, { onDelete: "CASCADE" })
  @JoinColumn({ name: "submission_id" })
  submission!: Submission;

  @Column({ name: "submission_version_id", type: "uuid" })
  submissionVersionId!: string;

  @ManyToOne(() => SubmissionVersion, { onDelete: "CASCADE" })
  @JoinColumn({ name: "submission_version_id" })
  submissionVersion!: SubmissionVersion;
}
