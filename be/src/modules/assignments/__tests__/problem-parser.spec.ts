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
    expect(r.url).toBe("https://programmers.co.kr/learn/courses/30/lessons/12345");
  });

  it("Programmers 스쿨 서브도메인 URL을 파싱한다", () => {
    const r = parseProblemUrl(
      "https://school.programmers.co.kr/learn/courses/30/lessons/389632",
    );
    expect(r.platform).toBe("Programmers");
    expect(r.externalId).toBe("30-389632");
    expect(r.url).toBe("https://school.programmers.co.kr/learn/courses/30/lessons/389632");
  });

  it("LeetCode slug를 파싱한다", () => {
    const r = parseProblemUrl("https://leetcode.com/problems/two-sum/");
    expect(r.platform).toBe("LeetCode");
    expect(r.externalId).toBe("two-sum");
    expect(r.inferredTitle).toBe("Two Sum");
    expect(r.url).toBe("https://leetcode.com/problems/two-sum/");
  });

  it("LeetCode description 경로와 쿼리를 정규화한다", () => {
    const r = parseProblemUrl(
      "https://leetcode.com/problems/jump-game-iii/description/?envType=daily-question&envId=2026-05-17",
    );
    expect(r.platform).toBe("LeetCode");
    expect(r.externalId).toBe("jump-game-iii");
    expect(r.url).toBe("https://leetcode.com/problems/jump-game-iii/");
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
