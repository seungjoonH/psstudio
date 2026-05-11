// 과제 제출 코드 AI 비교 분석 트리거 가능 여부를 검증하는 순수 함수입니다.
import { BadRequestException, ConflictException } from "@nestjs/common";

export const COHORT_ANALYSIS_MAX_SUBMISSIONS = 25;

export type CohortAnalysisExistingRow = { status: string } | null;

export function assertCohortAnalysisPreconditions(input: {
  dueAt: Date;
  now: Date;
  submissionCount: number;
}): void {
  if (input.now.getTime() < input.dueAt.getTime()) {
    throw new BadRequestException("마감 전에는 과제 제출 코드 AI 비교 분석을 실행할 수 없습니다.");
  }
  if (input.submissionCount < 2) {
    throw new BadRequestException("제출이 2건 이상일 때만 과제 제출 코드 AI 비교 분석을 실행할 수 있습니다.");
  }
  if (input.submissionCount > COHORT_ANALYSIS_MAX_SUBMISSIONS) {
    throw new BadRequestException(
      `제출이 ${COHORT_ANALYSIS_MAX_SUBMISSIONS}건을 초과하면 과제 제출 코드 AI 비교 분석을 실행할 수 없습니다.`,
    );
  }
}

export function assertCohortAnalysisTriggerAllowed(input: {
  dueAt: Date;
  now: Date;
  submissionCount: number;
  existing: CohortAnalysisExistingRow;
}): void {
  assertCohortAnalysisPreconditions(input);
  if (input.existing !== null && input.existing.status === "DONE") {
    throw new ConflictException("이미 완료된 과제 제출 코드 AI 비교 분석이 있습니다.");
  }
  if (input.existing !== null && input.existing.status === "RUNNING") {
    throw new ConflictException("과제 제출 코드 AI 비교 분석이 이미 진행 중입니다.");
  }
}

/** 완료·실패 분석을 DB에서 지우고 새로 돌릴 때. */
export function assertCohortAnalysisRerunAllowed(input: {
  dueAt: Date;
  now: Date;
  submissionCount: number;
  existing: CohortAnalysisExistingRow;
}): void {
  assertCohortAnalysisPreconditions(input);
  if (input.existing === null) {
    throw new BadRequestException("재실행할 과제 제출 코드 AI 비교 분석이 없습니다. 먼저 분석을 실행해 주세요.");
  }
  if (input.existing.status === "RUNNING") {
    throw new ConflictException("과제 제출 코드 AI 비교 분석이 이미 진행 중입니다.");
  }
  if (input.existing.status !== "DONE" && input.existing.status !== "FAILED") {
    throw new BadRequestException("과제 제출 코드 AI 비교 분석을 재실행할 수 있는 상태가 아닙니다.");
  }
}
