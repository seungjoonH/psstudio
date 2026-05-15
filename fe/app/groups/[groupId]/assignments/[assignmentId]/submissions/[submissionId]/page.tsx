// 제출 상세 페이지입니다. 최신 코드 + 버전 목록 + diff 진입을 제공합니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../../../src/auth/api.server";
import { getAssignment } from "../../../../../../../src/assignments/server";
import { getGroup } from "../../../../../../../src/groups/server";
import {
  addReaction,
  createReviewReply,
  createSubmissionReview,
  getSubmission,
  listSubmissionComments,
  listSubmissionReviews,
  removeReaction,
} from "../../../../../../../src/submissions/server";
import type { ReactionTargetType } from "../../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../../../src/ui/states/ErrorState";
import { SubmissionDetailPageClient } from "./SubmissionDetailPageClient";
import {
  createSubmissionCommentAction,
  createSubmissionCommentReplyAction,
  deleteSubmissionAction,
  requestSubmissionAiReviewAction,
  renameSubmissionAction,
  toggleCommentReactionAction,
  updateSubmissionNoteAction,
  updateSubmissionCodeAction,
} from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string; assignmentId: string; submissionId: string }>;
};

export default async function SubmissionDetailPage({ params }: Props) {
  const { groupId, assignmentId, submissionId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, detail, assignment, comments] = await Promise.all([
      getGroup(groupId),
      getSubmission(submissionId),
      getAssignment(assignmentId),
      listSubmissionComments(submissionId),
    ]);
    const reviews =
      detail.currentVersionNo > 0 ? await listSubmissionReviews(submissionId, detail.currentVersionNo) : [];
    const isOwner = detail.authorUserId === me.id;
    const isManager = group.myRole === "OWNER" || group.myRole === "MANAGER";
    const canRequestAiFeedback = group.rules.useAiFeedback && isOwner;
    const createReviewAction = async (formData: FormData) => {
      "use server";
      const versionNo = Number(formData.get("versionNo"));
      const startLine = Number(formData.get("startLine"));
      const endLineValue = formData.get("endLine");
      const endLine =
        endLineValue === null || String(endLineValue).length === 0 ? undefined : Number(endLineValue);
      const body = String(formData.get("body") ?? "").trim();
      if (
        !Number.isInteger(versionNo) ||
        !Number.isInteger(startLine) ||
        (endLine !== undefined && (!Number.isInteger(endLine) || endLine < startLine)) ||
        body.length === 0
      ) {
        return;
      }
      await createSubmissionReview(submissionId, { versionNo, startLine, endLine, body });
    };
    const createReplyAction = async (reviewId: string, body: string): Promise<void> => {
      "use server";
      const trimmed = body.trim();
      if (trimmed.length === 0) return;
      await createReviewReply(reviewId, { body: trimmed });
    };
    const toggleReactionAction = async (
      targetType: ReactionTargetType,
      targetId: string,
      emoji: string,
      reactedByMe: boolean,
    ): Promise<void> => {
      "use server";
      if (reactedByMe) {
        await removeReaction({ targetType, targetId, emoji });
        return;
      }
      await addReaction({ targetType, targetId, emoji });
    };
    return (
      <SubmissionDetailPageClient
        groupId={groupId}
        groupName={group.name}
        assignmentId={assignmentId}
        assignmentTitle={assignment.title}
        detail={detail}
        comments={comments}
        reviews={reviews}
        canEdit={isOwner}
        canDelete={isOwner || isManager}
        canRequestAiFeedback={canRequestAiFeedback}
        actions={{
          updateCode: updateSubmissionCodeAction.bind(null, groupId, assignmentId, submissionId),
          rename: renameSubmissionAction.bind(null, groupId, assignmentId, submissionId),
          deleteSubmission: deleteSubmissionAction.bind(null, groupId, assignmentId, submissionId),
          createComment: createSubmissionCommentAction.bind(null, groupId, assignmentId, submissionId),
          createCommentReply: createSubmissionCommentReplyAction.bind(
            null,
            groupId,
            assignmentId,
            submissionId,
          ),
          toggleCommentReaction: toggleCommentReactionAction.bind(
            null,
            groupId,
            assignmentId,
            submissionId,
          ),
          requestAiReview: requestSubmissionAiReviewAction.bind(null, groupId, assignmentId, submissionId),
          updateNote: updateSubmissionNoteAction.bind(null, groupId, assignmentId, submissionId),
          createReview: createReviewAction,
          createReviewReply: createReplyAction,
          toggleReviewReaction: toggleReactionAction,
        }}
      />
    );
  } catch (error) {
    return (
      <AppShell titleKey="submission.fallbackTitle">
        <ErrorState
          titleKey="submission.detail.errorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}
