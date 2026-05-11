// 집단 코드 비교 트리거 검증 정책 단위 테스트입니다.
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  COHORT_ANALYSIS_MAX_SUBMISSIONS,
  assertCohortAnalysisRerunAllowed,
  assertCohortAnalysisTriggerAllowed,
} from "../assignment-cohort-analysis.policy.js";

const past = new Date("2020-01-01T00:00:00.000Z");
const future = new Date("2099-01-01T00:00:00.000Z");
const now = new Date("2024-06-15T12:00:00.000Z");

describe("assertCohortAnalysisTriggerAllowed", () => {
  it("existing 이 DONE 이면 Conflict", () => {
    expect(() =>
      assertCohortAnalysisTriggerAllowed({
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
        dueAt: past,
        now,
        submissionCount: 2,
        existing: null,
      }),
    ).not.toThrow();
  });
});

describe("assertCohortAnalysisRerunAllowed", () => {
  it("existing 이 없으면 BadRequest", () => {
    expect(() =>
      assertCohortAnalysisRerunAllowed({
        dueAt: past,
        now,
        submissionCount: 2,
        existing: null,
      }),
    ).toThrow(BadRequestException);
  });

  it("DONE 이면 통과", () => {
    expect(() =>
      assertCohortAnalysisRerunAllowed({
        dueAt: past,
        now,
        submissionCount: 2,
        existing: { status: "DONE" },
      }),
    ).not.toThrow();
  });

  it("RUNNING 이면 Conflict", () => {
    expect(() =>
      assertCohortAnalysisRerunAllowed({
        dueAt: past,
        now,
        submissionCount: 2,
        existing: { status: "RUNNING" },
      }),
    ).toThrow(ConflictException);
  });
});
