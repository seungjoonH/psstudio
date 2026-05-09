"use server";

// 과제 관련 서버 액션입니다.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  autofillAssignment,
  createAssignment,
  deleteAssignment,
  getCohortAnalysis,
  startCohortAnalysis,
  updateAssignment,
  updateAssignmentMetadata,
} from "../../../../src/assignments/server";

export async function createAssignmentAction(groupId: string, formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const hint = String(formData.get("hint") ?? "");
  const problemUrl = String(formData.get("problemUrl") ?? "").trim();
  const dueAtLocal = String(formData.get("dueAt") ?? "").trim();
  const algorithms = String(formData.get("algorithms") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  const difficulty = String(formData.get("difficulty") ?? "").trim();
  const hintHiddenUntilSubmit = formData.get("hintHiddenUntilSubmit") === "on";
  const algorithmsHiddenUntilSubmit = formData.get("algorithmsHiddenUntilSubmit") === "on";
  const allowLateSubmission = formData.get("allowLateSubmission") === "on";
  if (title.length === 0 || problemUrl.length === 0 || dueAtLocal.length === 0) return;
  const created = await createAssignment(groupId, {
    title,
    hint,
    problemUrl,
    dueAt: new Date(dueAtLocal).toISOString(),
    allowLateSubmission,
  });
  await updateAssignmentMetadata(created.id, {
    algorithms: algorithms.length > 0 ? algorithms : undefined,
    difficulty: difficulty.length > 0 ? difficulty : undefined,
    hintHiddenUntilSubmit,
    algorithmsHiddenUntilSubmit,
  });
  redirect(`/groups/${groupId}/assignments/${created.id}`);
}

export async function autofillAssignmentAction(
  groupId: string,
  problemUrl: string,
): Promise<{ title: string; hint: string; algorithms: string[]; difficulty: string }> {
  const url = problemUrl.trim();
  if (url.length === 0) throw new Error("Enter a problem URL first.");
  return autofillAssignment(groupId, { problemUrl: url });
}

export async function updateAssignmentAction(
  groupId: string,
  assignmentId: string,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const hint = String(formData.get("hint") ?? "");
  const problemUrl = String(formData.get("problemUrl") ?? "").trim();
  const dueAtLocal = String(formData.get("dueAt") ?? "").trim();
  const allowLateSubmission = formData.get("allowLateSubmission") === "on";
  await updateAssignment(assignmentId, {
    title: title.length > 0 ? title : undefined,
    hint,
    problemUrl: problemUrl.length > 0 ? problemUrl : undefined,
    dueAt: dueAtLocal.length > 0 ? new Date(dueAtLocal).toISOString() : undefined,
    allowLateSubmission,
  });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}`);
}

export async function updateAssignmentCombinedAction(
  groupId: string,
  assignmentId: string,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const hint = String(formData.get("hint") ?? "");
  const problemUrl = String(formData.get("problemUrl") ?? "").trim();
  const dueAtLocal = String(formData.get("dueAt") ?? "").trim();
  const allowLateSubmission = formData.get("allowLateSubmission") === "on";
  const difficulty = String(formData.get("difficulty") ?? "").trim();
  const algorithms = String(formData.get("algorithms") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  const hintHiddenUntilSubmit = formData.get("hintHiddenUntilSubmit") === "on";
  const algorithmsHiddenUntilSubmit = formData.get("algorithmsHiddenUntilSubmit") === "on";

  await updateAssignment(assignmentId, {
    title: title.length > 0 ? title : undefined,
    hint,
    problemUrl: problemUrl.length > 0 ? problemUrl : undefined,
    dueAt: dueAtLocal.length > 0 ? new Date(dueAtLocal).toISOString() : undefined,
    allowLateSubmission,
  });
  await updateAssignmentMetadata(assignmentId, {
    algorithms: algorithms.length > 0 ? algorithms : [],
    difficulty: difficulty.length > 0 ? difficulty : undefined,
    hintHiddenUntilSubmit,
    algorithmsHiddenUntilSubmit,
  });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}`);
}

export async function updateMetadataAction(
  groupId: string,
  assignmentId: string,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const difficulty = String(formData.get("difficulty") ?? "").trim();
  const algorithms = String(formData.get("algorithms") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const hintHiddenUntilSubmit = formData.get("hintHiddenUntilSubmit") === "on";
  const algorithmsHiddenUntilSubmit = formData.get("algorithmsHiddenUntilSubmit") === "on";
  await updateAssignmentMetadata(assignmentId, {
    title: title.length > 0 ? title : undefined,
    difficulty: difficulty.length > 0 ? difficulty : undefined,
    algorithms: algorithms.length > 0 ? algorithms : undefined,
    hintHiddenUntilSubmit,
    algorithmsHiddenUntilSubmit,
  });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}`);
}

export async function deleteAssignmentAction(
  groupId: string,
  assignmentId: string,
  formData: FormData,
): Promise<void> {
  const confirmTitle = String(formData.get("confirmTitle") ?? "").trim();
  if (confirmTitle.length === 0) return;
  await deleteAssignment(assignmentId, confirmTitle);
  redirect(`/groups/${groupId}/assignments`);
}

export async function getCohortAnalysisStateAction(assignmentId: string) {
  return getCohortAnalysis(assignmentId);
}

export async function startCohortAnalysisAction(groupId: string, assignmentId: string) {
  const h = await headers();
  const acceptLanguage = h.get("accept-language") ?? "ko";
  const data = await startCohortAnalysis(assignmentId, { acceptLanguage });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}`);
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/cohort`);
  return data;
}
