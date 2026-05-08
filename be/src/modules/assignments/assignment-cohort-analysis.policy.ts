// 집단 코드 비교 분석 트리거 가능 여부를 검증하는 순수 함수입니다.
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";

export const COHORT_ANALYSIS_MAX_SUBMISSIONS = 25;

export type CohortAnalysisExistingRow = { status: string } | null;

export function assertCohortAnalysisTriggerAllowed(input: {
  translationLanguage: string;
  dueAt: Date;
  now: Date;
  submissionCount: number;
  existing: CohortAnalysisExistingRow;
}): void {
  if (input.translationLanguage === "none") {
    throw new ForbiddenException("집단 코드 비교는 그룹 공통 언어가 설정된 경우에만 실행할 수 있습니다.");
  }
  if (input.existing !== null && input.existing.status === "DONE") {
    throw new ConflictException("이미 완료된 집단 코드 비교가 있습니다.");
  }
  if (input.existing !== null && input.existing.status === "RUNNING") {
    throw new ConflictException("집단 코드 비교가 이미 진행 중입니다.");
  }
  if (input.now.getTime() < input.dueAt.getTime()) {
    throw new BadRequestException("마감 전에는 집단 코드 비교를 실행할 수 없습니다.");
  }
  if (input.submissionCount < 2) {
    throw new BadRequestException("제출이 2건 이상일 때만 집단 코드 비교를 실행할 수 있습니다.");
  }
  if (input.submissionCount > COHORT_ANALYSIS_MAX_SUBMISSIONS) {
    throw new BadRequestException(
      `제출이 ${COHORT_ANALYSIS_MAX_SUBMISSIONS}건을 초과하면 집단 코드 비교를 실행할 수 없습니다.`,
    );
  }
}
