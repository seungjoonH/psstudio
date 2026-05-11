// 제출과 리뷰의 상태/분류 enum입니다.
export const REVIEW_TYPES = {
  LINE: "LINE",
  RANGE: "RANGE",
  FILE: "FILE",
  SUBMISSION: "SUBMISSION",
} as const;

export type ReviewType = keyof typeof REVIEW_TYPES;

export const AI_ANALYSIS_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;

export type AiAnalysisStatus = keyof typeof AI_ANALYSIS_STATUS;

export const SUPPORTED_LANGUAGES = [
  "cpp",
  "c",
  "java",
  "python",
  "javascript",
  "typescript",
  "go",
  "kotlin",
  "swift",
  "ruby",
  "csharp",
  "other",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const MAX_SUBMISSION_CODE_BYTES = 200 * 1024;
