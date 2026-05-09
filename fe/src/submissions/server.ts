// 제출 BE 호출 헬퍼입니다.
import { apiFetch } from "../api/server";

export type SubmissionListItemDto = {
  id: string;
  assignmentId: string;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  title: string;
  language: string;
  isLate: boolean;
  currentVersionNo: number;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionDetailDto = SubmissionListItemDto & {
  latestCode: string;
  noteMarkdown: string;
  currentVersionHasAiFeedback: boolean;
  versions: Array<{ versionNo: number; language: string; createdAt: string }>;
};

export type ReactionTargetType = "review" | "review_reply" | "comment" | "post_comment";

export type ReactionSummaryDto = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
};

export type ReviewReplyDto = {
  id: string;
  reviewId: string;
  parentReplyId: string | null;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  body: string;
  isAdminHidden: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: ReactionSummaryDto[];
};

export type SubmissionReviewDto = {
  id: string;
  versionNo: number;
  reviewType: "LINE" | "RANGE";
  startLine: number;
  endLine: number;
  body: string;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  createdAt: string;
  reactions: ReactionSummaryDto[];
  replies: ReviewReplyDto[];
};

export type SubmissionCommentReplyDto = {
  id: string;
  body: string;
  submissionVersionNo: number | null;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  parentCommentId: string;
  createdAt: string;
  reactions: ReactionSummaryDto[];
};

export type SubmissionCommentDto = {
  id: string;
  body: string;
  submissionVersionNo: number | null;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  createdAt: string;
  reactions: ReactionSummaryDto[];
  replies: SubmissionCommentReplyDto[];
};

type ListQuery = {
  sort?: "createdAtAsc" | "createdAtDesc";
  authorId?: string;
  language?: string;
  isLate?: boolean;
};

function buildQuery(q: ListQuery): string {
  const parts: string[] = [];
  if (q.sort !== undefined) parts.push(`sort=${encodeURIComponent(q.sort)}`);
  if (q.authorId !== undefined) parts.push(`authorId=${encodeURIComponent(q.authorId)}`);
  if (q.language !== undefined) parts.push(`language=${encodeURIComponent(q.language)}`);
  if (q.isLate !== undefined) parts.push(`isLate=${q.isLate ? "true" : "false"}`);
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

export function listSubmissions(
  assignmentId: string,
  query: ListQuery = {},
): Promise<SubmissionListItemDto[]> {
  return apiFetch(`/api/v1/assignments/${assignmentId}/submissions${buildQuery(query)}`);
}

export function getSubmission(submissionId: string): Promise<SubmissionDetailDto> {
  return apiFetch(`/api/v1/submissions/${submissionId}`);
}

export function getSubmissionVersion(
  submissionId: string,
  versionNo: number,
): Promise<{ language: string; code: string }> {
  return apiFetch(`/api/v1/submissions/${submissionId}/versions/${versionNo}`);
}

export function createSubmission(
  assignmentId: string,
  body: { title?: string; language: string; code: string; noteMarkdown?: string },
): Promise<SubmissionDetailDto> {
  return apiFetch(`/api/v1/assignments/${assignmentId}/submissions`, {
    method: "POST",
    json: body,
  });
}

export function updateSubmissionCode(
  submissionId: string,
  body: { language: string; code: string },
): Promise<{ submissionId: string; newVersionNo: number }> {
  return apiFetch(`/api/v1/submissions/${submissionId}/code`, { method: "PATCH", json: body });
}

export function renameSubmission(submissionId: string, title: string): Promise<unknown> {
  return apiFetch(`/api/v1/submissions/${submissionId}/title`, {
    method: "PATCH",
    json: { title },
  });
}

export function updateSubmissionNote(submissionId: string, noteMarkdown: string): Promise<unknown> {
  return apiFetch(`/api/v1/submissions/${submissionId}/note`, {
    method: "PATCH",
    json: { noteMarkdown },
  });
}

export function deleteSubmission(submissionId: string): Promise<unknown> {
  return apiFetch(`/api/v1/submissions/${submissionId}`, { method: "DELETE" });
}

export function requestSubmissionAiReview(
  submissionId: string,
  body: { versionNo?: number } = {},
): Promise<{ submissionId: string; versionNo: number }> {
  return apiFetch(`/api/v1/submissions/${submissionId}/ai-review`, {
    method: "POST",
    json: body,
  });
}

export function getSubmissionDiff(
  submissionId: string,
  from: number,
  to: number,
): Promise<{ fromVersion: number; toVersion: number; diffText: string }> {
  return apiFetch(`/api/v1/submissions/${submissionId}/diff?from=${from}&to=${to}`);
}

export function listSubmissionReviews(
  submissionId: string,
  versionNo: number,
): Promise<SubmissionReviewDto[]> {
  return apiFetch(`/api/v1/submissions/${submissionId}/reviews?versionNo=${versionNo}`);
}

export function createSubmissionReview(
  submissionId: string,
  body: { versionNo: number; startLine: number; endLine?: number; body: string },
): Promise<SubmissionReviewDto> {
  return apiFetch(`/api/v1/submissions/${submissionId}/reviews`, {
    method: "POST",
    json: body,
  });
}

export function listSubmissionComments(submissionId: string): Promise<SubmissionCommentDto[]> {
  return apiFetch(`/api/v1/submissions/${submissionId}/comments`);
}

export function createSubmissionComment(
  submissionId: string,
  body: { body: string; parentCommentId?: string },
): Promise<SubmissionCommentDto | SubmissionCommentReplyDto> {
  return apiFetch(`/api/v1/submissions/${submissionId}/comments`, {
    method: "POST",
    json: body,
  });
}

export function listReviewReplies(reviewId: string): Promise<ReviewReplyDto[]> {
  return apiFetch(`/api/v1/reviews/${reviewId}/replies`);
}

export function createReviewReply(
  reviewId: string,
  body: { body: string },
): Promise<ReviewReplyDto> {
  return apiFetch(`/api/v1/reviews/${reviewId}/replies`, {
    method: "POST",
    json: body,
  });
}

export function deleteReviewReply(replyId: string): Promise<unknown> {
  return apiFetch(`/api/v1/review-replies/${replyId}`, { method: "DELETE" });
}

export function addReaction(body: {
  targetType: ReactionTargetType;
  targetId: string;
  emoji: string;
}): Promise<{
  id: string;
  targetType: ReactionTargetType;
  targetId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}> {
  return apiFetch(`/api/v1/reactions`, { method: "POST", json: body });
}

export function removeReaction(body: {
  targetType: ReactionTargetType;
  targetId: string;
  emoji: string;
}): Promise<unknown> {
  return apiFetch(`/api/v1/reactions`, { method: "DELETE", json: body });
}
