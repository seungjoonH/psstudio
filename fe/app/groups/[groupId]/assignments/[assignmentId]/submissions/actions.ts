"use server";

// 제출 관련 서버 액션입니다.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addReaction,
  createSubmissionComment,
  createSubmission,
  deleteSubmission,
  requestSubmissionAiReview,
  removeReaction,
  renameSubmission,
  updateSubmissionNote,
  updateSubmissionCode,
} from "../../../../../../src/submissions/server";
import type { ReactionTargetType } from "../../../../../../src/submissions/server";

export async function createSubmissionAction(
  groupId: string,
  assignmentId: string,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const language = String(formData.get("language") ?? "").trim();
  const code = String(formData.get("code") ?? "");
  const noteMarkdown = String(formData.get("noteMarkdown") ?? "");
  if (language.length === 0 || code.length === 0) return;
  const created = await createSubmission(assignmentId, {
    title: title.length > 0 ? title : undefined,
    language,
    code,
    noteMarkdown,
  });
  redirect(`/groups/${groupId}/assignments/${assignmentId}/submissions/${created.id}`);
}

export async function updateSubmissionCodeAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
  formData: FormData,
): Promise<void> {
  const language = String(formData.get("language") ?? "").trim();
  const code = String(formData.get("code") ?? "");
  if (language.length === 0 || code.length === 0) return;
  await updateSubmissionCode(submissionId, { language, code });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}

export async function renameSubmissionAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) return;
  await renameSubmission(submissionId, title);
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}

export async function updateSubmissionNoteAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
  formData: FormData,
): Promise<void> {
  const noteMarkdown = String(formData.get("noteMarkdown") ?? "");
  await updateSubmissionNote(submissionId, noteMarkdown);
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}

export async function deleteSubmissionAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
): Promise<void> {
  await deleteSubmission(submissionId);
  redirect(`/groups/${groupId}/assignments/${assignmentId}/submissions`);
}

export async function requestSubmissionAiReviewAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
): Promise<void> {
  await requestSubmissionAiReview(submissionId);
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}

export async function createSubmissionCommentAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
  formData: FormData,
): Promise<void> {
  const body = String(formData.get("body") ?? "").trim();
  if (body.length === 0) return;
  await createSubmissionComment(submissionId, { body });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}

export async function createSubmissionCommentReplyAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
  parentCommentId: string,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return;
  await createSubmissionComment(submissionId, { body: trimmed, parentCommentId });
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}

export async function toggleCommentReactionAction(
  groupId: string,
  assignmentId: string,
  submissionId: string,
  targetType: ReactionTargetType,
  targetId: string,
  emoji: string,
  reactedByMe: boolean,
): Promise<void> {
  if (reactedByMe) {
    await removeReaction({ targetType, targetId, emoji });
  } else {
    await addReaction({ targetType, targetId, emoji });
  }
  revalidatePath(`/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`);
}
