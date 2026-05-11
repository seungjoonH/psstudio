// 피드백 공개 단위와 공개 범위를 정의합니다.
export const FEEDBACK_KINDS = {
  SUBMISSION_CODE: "SUBMISSION_CODE",
  HUMAN_COMMENT: "HUMAN_COMMENT",
  CODE_REVIEW: "CODE_REVIEW",
  AI_LANGUAGE: "AI_LANGUAGE",
  AI_PROBLEM_TAGS: "AI_PROBLEM_TAGS",
  AI_SUBMISSION_TAGS: "AI_SUBMISSION_TAGS",
  AI_IMPROVEMENT: "AI_IMPROVEMENT",
} as const;

export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

export const VISIBILITY_SCOPES = {
  AUTHOR_ONLY: "AUTHOR_ONLY",
  AUTHOR_AND_ADMINS: "AUTHOR_AND_ADMINS",
  GROUP_MEMBERS: "GROUP_MEMBERS",
} as const;

export type VisibilityScope = keyof typeof VISIBILITY_SCOPES;

export type FeedbackPolicy = {
  beforeDeadline: Record<FeedbackKind, VisibilityScope>;
  afterDeadline: Record<FeedbackKind, VisibilityScope>;
  allowLateSubmission: boolean;
};

export const DEFAULT_FEEDBACK_POLICY: FeedbackPolicy = {
  beforeDeadline: {
    SUBMISSION_CODE: "AUTHOR_AND_ADMINS",
    HUMAN_COMMENT: "AUTHOR_AND_ADMINS",
    CODE_REVIEW: "AUTHOR_AND_ADMINS",
    AI_LANGUAGE: "AUTHOR_ONLY",
    AI_PROBLEM_TAGS: "GROUP_MEMBERS",
    AI_SUBMISSION_TAGS: "AUTHOR_ONLY",
    AI_IMPROVEMENT: "AUTHOR_ONLY",
  },
  afterDeadline: {
    SUBMISSION_CODE: "GROUP_MEMBERS",
    HUMAN_COMMENT: "GROUP_MEMBERS",
    CODE_REVIEW: "GROUP_MEMBERS",
    AI_LANGUAGE: "GROUP_MEMBERS",
    AI_PROBLEM_TAGS: "GROUP_MEMBERS",
    AI_SUBMISSION_TAGS: "GROUP_MEMBERS",
    AI_IMPROVEMENT: "GROUP_MEMBERS",
  },
  allowLateSubmission: true,
};
