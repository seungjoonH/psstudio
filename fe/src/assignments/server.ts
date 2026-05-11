// 과제 BE 호출 헬퍼입니다.
import type { ProblemPlatform } from "@psstudio/shared";
import { apiFetch } from "../api/server";

export type AssignmentDto = {
  id: string;
  groupId: string;
  title: string;
  hintPlain: string;
  problemUrl: string;
  platform: ProblemPlatform;
  difficulty: string | null;
  dueAt: string;
  allowLateSubmission: boolean;
  createdByUserId: string;
  createdAt: string;
  metadata: {
    title?: string;
    difficulty?: string;
    algorithms?: string[];
    rawNotes?: string;
    hintHiddenUntilSubmit?: boolean;
    algorithmsHiddenUntilSubmit?: boolean;
  };
  analysisStatus: string;
  isLate: boolean;
  hasMySubmission?: boolean;
};

export type DeletionImpact = {
  submissionCount: number;
  reviewCount: number;
  commentCount: number;
};

export type AssignmentAutofillDto = {
  title: string;
  hint: string;
  algorithms: string[];
  difficulty: string;
};

export function listAssignments(groupId: string): Promise<AssignmentDto[]> {
  return apiFetch(`/api/v1/groups/${groupId}/assignments`);
}

export function getAssignment(assignmentId: string): Promise<AssignmentDto> {
  return apiFetch(`/api/v1/assignments/${assignmentId}`);
}

export function createAssignment(
  groupId: string,
  body: {
    title: string;
    hint?: string;
    problemUrl: string;
    dueAt: string;
    allowLateSubmission: boolean;
  },
): Promise<AssignmentDto> {
  return apiFetch(`/api/v1/groups/${groupId}/assignments`, { method: "POST", json: body });
}

export function updateAssignment(
  assignmentId: string,
  body: Partial<{
    title: string;
    hint: string;
    problemUrl: string;
    dueAt: string;
    allowLateSubmission: boolean;
  }>,
): Promise<AssignmentDto> {
  return apiFetch(`/api/v1/assignments/${assignmentId}`, { method: "PATCH", json: body });
}

export function updateAssignmentMetadata(
  assignmentId: string,
  body: Partial<{
    title: string;
    difficulty: string;
    platform: ProblemPlatform;
    algorithms: string[];
    hintHiddenUntilSubmit: boolean;
    algorithmsHiddenUntilSubmit: boolean;
  }>,
): Promise<AssignmentDto> {
  return apiFetch(`/api/v1/assignments/${assignmentId}/metadata`, { method: "PATCH", json: body });
}

export function getDeletionImpact(assignmentId: string): Promise<DeletionImpact> {
  return apiFetch(`/api/v1/assignments/${assignmentId}/deletion-impact`);
}

export function deleteAssignment(assignmentId: string, confirmTitle: string): Promise<{ deleted: true }> {
  return apiFetch(`/api/v1/assignments/${assignmentId}`, {
    method: "DELETE",
    json: { confirmTitle },
  });
}

export function autofillAssignment(
  groupId: string,
  body: { problemUrl: string },
): Promise<AssignmentAutofillDto> {
  return apiFetch(`/api/v1/groups/${groupId}/assignments/autofill`, {
    method: "POST",
    json: body,
  });
}

export type CohortRegionArtifact = {
  roleId: string;
  roleLabel: string;
  startLine: number;
  endLine: number;
};

export type CohortSubmissionArtifact = {
  submissionId: string;
  code: string;
  language: string;
  regions: CohortRegionArtifact[];
};

export type CohortAnalysisArtifacts = {
  submissions: CohortSubmissionArtifact[];
};

export type CohortAnalysisDto = {
  status: "NONE" | "RUNNING" | "DONE" | "FAILED";
  reportLocale?: string | null;
  failureReason?: string | null;
  reportMarkdown?: string | null;
  artifacts?: CohortAnalysisArtifacts | Record<string, unknown>;
  tokenUsed?: number;
  includedSubmissions?: Array<{
    submissionId: string;
    versionNo: number;
    authorUserId: string;
    authorNickname: string;
    title: string;
    authorProfileImageUrl: string;
  }>;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export function getCohortAnalysis(assignmentId: string): Promise<CohortAnalysisDto> {
  return apiFetch(`/api/v1/assignments/${assignmentId}/cohort-analysis`);
}

export function startCohortAnalysis(
  assignmentId: string,
  options?: { acceptLanguage?: string; rerun?: boolean },
): Promise<CohortAnalysisDto> {
  const extraHeaders: Record<string, string> = {};
  if (options?.acceptLanguage !== undefined && options.acceptLanguage.length > 0) {
    extraHeaders["Accept-Language"] = options.acceptLanguage;
  }
  const rerun = options?.rerun === true;
  return apiFetch(`/api/v1/assignments/${assignmentId}/cohort-analysis`, {
    method: "POST",
    headers: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
    ...(rerun ? { json: { rerun: true } } : {}),
  });
}
