// 과제 상태 enum입니다.
export const ASSIGNMENT_STATUS = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  CLOSED: "CLOSED",
  FEEDBACK_OPEN: "FEEDBACK_OPEN",
  ENDED: "ENDED",
} as const;

export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUS;

export const PROBLEM_ANALYSIS_STATUS = {
  NONE: "NONE",
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;

export type ProblemAnalysisStatus = keyof typeof PROBLEM_ANALYSIS_STATUS;

export const JOIN_REQUEST_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type JoinRequestStatus = keyof typeof JOIN_REQUEST_STATUS;
