import { describe, expect, it } from "vitest";
import {
  extractBojOfficialTitle,
  extractLeetCodeOfficialTitle,
  extractOfficialProblemTitle,
  extractProgrammersOfficialTitle,
} from "../problem-official-title.js";

describe("extractProgrammersOfficialTitle", () => {
  it("data-lesson-title 우선", () => {
    const html = `<div data-lesson-title="유연근무제" data-lesson-id="388351">`;
    expect(extractProgrammersOfficialTitle(html)).toBe("유연근무제");
  });

  it("challenge-title span", () => {
    const html = `<span class="challenge-title">두 큐 합 같게 만들기</span>`;
    expect(extractProgrammersOfficialTitle(html)).toBe("두 큐 합 같게 만들기");
  });

  it("title 태그에서 코딩테스트 연습 - 이름 | 형식", () => {
    const html = `<head><title>코딩테스트 연습 - 유연근무제 | 프로그래머스 스쿨</title></head>`;
    expect(extractProgrammersOfficialTitle(html)).toBe("유연근무제");
  });
});

describe("extractOfficialProblemTitle", () => {
  it("플랫폼별 라우팅", () => {
    const pg = `<html data-lesson-title="테스트문제"></html>`;
    expect(extractOfficialProblemTitle("Programmers", pg)).toBe("테스트문제");
    expect(extractOfficialProblemTitle("BOJ", pg)).toBe("");
    expect(extractOfficialProblemTitle("Other", pg)).toBe("");
  });
});

describe("extractLeetCodeOfficialTitle", () => {
  it("og:title에서 LeetCode 접미사 제거", () => {
    const html = `<meta property="og:title" content="Two Sum - LeetCode" />`;
    expect(extractLeetCodeOfficialTitle(html)).toBe("Two Sum");
  });
});

describe("extractBojOfficialTitle", () => {
  it("problem_title span", () => {
    const html = `<span id="problem_title">A+B</span>`;
    expect(extractBojOfficialTitle(html)).toBe("A+B");
  });
});
