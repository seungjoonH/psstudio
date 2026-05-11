"use client";

// 제출 상세 페이지의 본문 영역을 i18n 적용해 렌더링합니다.
import Link from "next/link";
import { useI18n } from "../../../../../../../src/i18n/I18nProvider";
import type {
  ReactionTargetType,
  SubmissionCommentDto,
  SubmissionDetailDto,
  SubmissionReviewDto,
} from "../../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../../src/shell/AppShell";
import { Button } from "../../../../../../../src/ui/Button";
import { GroupSubnavCluster } from "../../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../../GroupRouteBreadcrumbs";
import { SubmissionDetailClient } from "./SubmissionDetailClient";

type Actions = {
  updateCode: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  deleteSubmission: () => Promise<void>;
  createComment: (formData: FormData) => Promise<void>;
  createCommentReply: (parentCommentId: string, body: string) => Promise<void>;
  requestAiReview: () => Promise<void>;
  updateNote: (formData: FormData) => Promise<void>;
  toggleCommentReaction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
  createReview: (formData: FormData) => Promise<void>;
  createReviewReply: (reviewId: string, body: string) => Promise<void>;
  toggleReviewReaction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
};

type Props = {
  groupId: string;
  groupName: string;
  assignmentId: string;
  assignmentTitle: string;
  detail: SubmissionDetailDto;
  comments: SubmissionCommentDto[];
  reviews: SubmissionReviewDto[];
  canEdit: boolean;
  canDelete: boolean;
  canRequestAiFeedback: boolean;
  actions: Actions;
};

export function SubmissionDetailPageClient({
  groupId,
  groupName,
  assignmentId,
  assignmentTitle,
  detail,
  comments,
  reviews,
  canEdit,
  canDelete,
  canRequestAiFeedback,
  actions,
}: Props) {
  const { t } = useI18n();

  return (
    <AppShell
      title={`${groupName} ${t("groupNav.assignments")}`}
      subtitleKey="assignment.list.subtitle"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <GroupSubnavCluster groupId={groupId}>
          <GroupRouteBreadcrumbs
            groupId={groupId}
            assignmentTitle={assignmentTitle}
            submissionTitle={detail.title}
          />
        </GroupSubnavCluster>

        <SubmissionDetailClient
          groupId={groupId}
          assignmentId={assignmentId}
          submission={detail}
          comments={comments}
          reviews={reviews}
          canEdit={canEdit}
          canDelete={canDelete}
          canRequestAiFeedback={canRequestAiFeedback}
          actions={actions}
        />

        {detail.versions.length > 1 ? (
          <div>
            <Link
              href={`/groups/${groupId}/assignments/${assignmentId}/submissions/${detail.id}/diff?from=${detail.versions[0].versionNo}&to=${detail.currentVersionNo}`}
            >
              <Button type="button" variant="secondary">
                {t("submission.detail.diffBtn")}
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
