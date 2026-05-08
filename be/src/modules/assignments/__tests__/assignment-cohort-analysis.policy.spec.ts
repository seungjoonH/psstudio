// 집단 코드 비교 트리거 검증 정책 단위 테스트입니다.
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  COHORT_ANALYSIS_MAX_SUBMISSIONS,
  assertCohortAnalysisTriggerAllowed,
} from "../assignment-cohort-analysis.policy.js";

const past = new Date("2020-01-01T00:00:00.000Z");
const future = new Date("2099-01-01T00:00:00.000Z");
const now = new Date("2024-06-15T12:00:00.000Z");

describe("assertCohortAnalysisTriggerAllowed", () => {
  it("translationLanguage 가 none 이면 Forbidden", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "none",
        dueAt: past,
        now,
        submissionCount: 2,
        existing: null,
      }),
    ).toThrow(ForbiddenException);
  });

  it("existing 이 DONE 이면 Conflict", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "python",
        dueAt: past,
        now,
        submissionCount: 2,
        existing: { status: "DONE" },
      }),
    ).toThrow(ConflictException);
  });

  it("existing 이 RUNNING 이면 Conflict", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "python",
        dueAt: past,
        now,
        submissionCount: 2,
        existing: { status: "RUNNING" },
      }),
    ).toThrow(ConflictException);
  });

  it("마감 전이면 BadRequest", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "python",
        dueAt: future,
        now,
        submissionCount: 2,
        existing: null,
      }),
    ).toThrow(BadRequestException);
  });

  it("제출이 1건이면 BadRequest", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "python",
        dueAt: past,
        now,
        submissionCount: 1,
        existing: null,
      }),
    ).toThrow(BadRequestException);
  });

  it(`제출이 ${COHORT_ANALYSIS_MAX_SUBMISSIONS} 초과면 BadRequest`, () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "python",
        dueAt: past,
        now,
        submissionCount: COHORT_ANALYSIS_MAX_SUBMISSIONS + 1,
        existing: null,
      }),
    ).toThrow(BadRequestException);
  });

  it("FAILED 후 재시도는 허용", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "python",
        dueAt: past,
        now,
        submissionCount: 2,
        existing: { status: "FAILED" },
      }),
    ).not.toThrow();
  });

  it("정상 조건이면 통과", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
        translationLanguage: "pseudo",
        dueAt: past,
        now,
        submissionCount: 2,
        existing: null,
      }),
    ).not.toThrow();
  });
});
