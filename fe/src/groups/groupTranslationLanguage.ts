// 새 제출 폼 등에서 선택 가능한 제출 코드 언어 목록입니다.

export const GROUP_TRANSLATION_LANGUAGE_VALUES = [
  "python",
  "java",
  "cpp",
  "javascript",
  "typescript",
  "c",
] as const;

export type GroupTranslationLanguage = (typeof GROUP_TRANSLATION_LANGUAGE_VALUES)[number];
