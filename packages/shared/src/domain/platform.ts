// 문제 플랫폼 식별자를 정의합니다.
export const PROBLEM_PLATFORMS = {
  BOJ: "BOJ",
  Programmers: "Programmers",
  LeetCode: "LeetCode",
  Other: "Other",
} as const;

export type ProblemPlatform = keyof typeof PROBLEM_PLATFORMS;
