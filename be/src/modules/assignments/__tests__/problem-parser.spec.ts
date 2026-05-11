// 문제 URL 파서 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { parseProblemUrl } from "../problem-parser.js";

describe("parseProblemUrl", () => {
  it("BOJ 문제 URL을 파싱한다", () => {
    const r = parseProblemUrl("https://www.acmicpc.net/problem/1000");
    expect(r.platform).toBe("BOJ");
    expect(r.externalId).toBe("1000");
    expect(r.inferredTitle).toBe("백준 1000번");
  });

  it("Programmers 강의/문제 URL을 파싱한다", () => {
    const r = parseProblemUrl("https://programmers.co.kr/learn/courses/30/lessons/12345");
    expect(r.platform).toBe("Programmers");
    expect(r.externalId).toBe("30-12345");
  });

  it("LeetCode slug를 파싱한다", () => {
    const r = parseProblemUrl("https://leetcode.com/problems/two-sum/");
    expect(r.platform).toBe("LeetCode");
    expect(r.externalId).toBe("two-sum");
    expect(r.inferredTitle).toBe("Two Sum");
  });

  it("알 수 없는 도메인은 Other로 처리한다", () => {
    const r = parseProblemUrl("https://example.com/problems/abc");
    expect(r.platform).toBe("Other");
    expect(r.externalId).toBeNull();
  });

  it("올바르지 않은 URL은 Other로 처리한다", () => {
    const r = parseProblemUrl("not a url");
    expect(r.platform).toBe("Other");
  });
});
