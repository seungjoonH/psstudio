// 문제 URL을 받아 플랫폼/번호/슬러그를 추출하는 파서입니다.
import type { ProblemPlatform } from "@psstudio/shared";

export type ParsedProblem = {
  platform: ProblemPlatform;
  externalId: string | null;
  inferredTitle: string | null;
  url: string;
};

export function parseProblemUrl(input: string): ParsedProblem {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { platform: "Other", externalId: null, inferredTitle: null, url: trimmed };
  }
  const host = url.hostname.toLowerCase();
  if (host === "www.acmicpc.net" || host === "acmicpc.net") {
    const m = url.pathname.match(/\/problem\/(\d+)/);
    return {
      platform: "BOJ",
      externalId: m === null ? null : m[1],
      inferredTitle: m === null ? null : `백준 ${m[1]}번`,
      url: url.toString(),
    };
  }
  if (host === "programmers.co.kr" || host.endsWith(".programmers.co.kr")) {
    const m = url.pathname.match(/\/learn\/courses\/(\d+)\/lessons\/(\d+)/);
    return {
      platform: "Programmers",
      externalId: m === null ? null : `${m[1]}-${m[2]}`,
      inferredTitle: null,
      url: url.toString(),
    };
  }
  if (host === "leetcode.com" || host.endsWith(".leetcode.com") || host === "leetcode.cn") {
    const m = url.pathname.match(/\/problems\/([^/]+)\/?/);
    if (m === null) {
      return { platform: "LeetCode", externalId: null, inferredTitle: null, url: url.toString() };
    }
    const slug = m[1];
    const inferred = slug
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
    return { platform: "LeetCode", externalId: slug, inferredTitle: inferred, url: url.toString() };
  }
  return { platform: "Other", externalId: null, inferredTitle: null, url: url.toString() };
}
