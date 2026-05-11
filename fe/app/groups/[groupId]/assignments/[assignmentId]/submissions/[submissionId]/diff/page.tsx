// 제출 버전 간 diff를 보여주는 페이지입니다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPatch } from "diff";
import { fetchMeServer } from "../../../../../../../../src/auth/api.server";
import { getAssignment } from "../../../../../../../../src/assignments/server";
import { getGroup } from "../../../../../../../../src/groups/server";
import {
  addReaction,
  createReviewReply,
  createSubmissionReview,
  getSubmission,
  getSubmissionDiff,
  getSubmissionVersion,
  listSubmissionReviews,
  removeReaction,
} from "../../../../../../../../src/submissions/server";
import type { ReactionTargetType } from "../../../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../../../../src/ui/states/ErrorState";
import { GroupSubnavCluster } from "../../../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../../../GroupRouteBreadcrumbs";
// @ts-ignore Cursor TS 진단이 새 App Router sibling 파일을 못 찾는 false-positive입니다.
import { DiffViewerClient } from "./DiffViewerClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string; assignmentId: string; submissionId: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
};

export default async function SubmissionDiffPage({ params, searchParams }: Props) {
  const { groupId, assignmentId, submissionId } = await params;
  const sp = (await searchParams) ?? {};
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const detail = await getSubmission(submissionId);
    const toVersion = sp.to === undefined ? detail.currentVersionNo : Number(sp.to);
    let fromVersion = sp.from === undefined ? toVersion : Number(sp.from);
    const maxVersion = detail.currentVersionNo;
    if (
      !Number.isInteger(fromVersion) ||
      !Number.isInteger(toVersion) ||
      fromVersion < 0 ||
      toVersion < 0 ||
      fromVersion > maxVersion ||
      toVersion > maxVersion
    ) {
      return (
        <AppShell titleKey="submission.diff.fallbackTitle">
          <ErrorState
            titleKey="submission.diff.invalidTitle"
            descriptionKey="submission.diff.invalidDesc"
          />
        </AppShell>
      );
    }
    let diff: Awaited<ReturnType<typeof getSubmissionDiff>> | null = null;
    let reviews: Awaited<ReturnType<typeof listSubmissionReviews>> = [];
    let sameVersionCode: string | null = null;
    let sameVersionLanguage: string | null = null;
    let diffLanguage = detail.language;
    if (fromVersion === toVersion) {
      if (toVersion === 0) {
        sameVersionCode = "";
        sameVersionLanguage = detail.language;
      } else if (toVersion === detail.currentVersionNo) {
        sameVersionCode = detail.latestCode;
        sameVersionLanguage = detail.language;
      } else {
        const version = await getSubmissionVersion(submissionId, toVersion);
        sameVersionCode = version.code;
        sameVersionLanguage = version.language;
      }
      reviews = toVersion > 0 ? await listSubmissionReviews(submissionId, toVersion) : [];
    } else {
      try {
        [diff, reviews] = await Promise.all([
          getSubmissionDiff(submissionId, fromVersion, toVersion),
          listSubmissionReviews(submissionId, toVersion),
        ]);
      } catch {
        const [fromCode, toCode, toVersionData] = await Promise.all([
          resolveVersionCode(submissionId, detail.latestCode, fromVersion, detail.currentVersionNo),
          resolveVersionCode(submissionId, detail.latestCode, toVersion, detail.currentVersionNo),
          toVersion === 0 ? Promise.resolve(null) : resolveVersionData(submissionId, detail, toVersion),
        ]);
        diff = {
          fromVersion,
          toVersion,
          diffText: createPatch(`v${fromVersion}->v${toVersion}`, fromCode, toCode, "", ""),
        };
        reviews = toVersion > 0 ? await listSubmissionReviews(submissionId, toVersion) : [];
        if (toVersionData !== null) {
          diffLanguage = toVersionData.language;
        }
      }
    }
    const [group, assignment] = await Promise.all([getGroup(groupId), getAssignment(assignmentId)]);
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
        redirect(
          `/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}/diff?from=${fromVersion}&to=${toVersion}`,
        );
      }
      await createSubmissionReview(submissionId, { versionNo, startLine, endLine, body });
      revalidatePath(
        `/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}/diff`,
        "page",
      );
      redirect(
        `/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}/diff?from=${fromVersion}&to=${toVersion}`,
      );
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
      <AppShell
        titleKey="assignment.list.title"
        titleVars={{ name: group.name }}
        subtitleKey="assignment.list.subtitle"
      >
        <div style={{ display: "grid", gap: 16 }}>
          <GroupSubnavCluster groupId={groupId}>
            <GroupRouteBreadcrumbs
              groupId={groupId}
              assignmentTitle={assignment.title}
              submissionTitle={detail.title}
            />
          </GroupSubnavCluster>
          <DiffViewerClient
            groupId={groupId}
            assignmentId={assignmentId}
            submissionId={submissionId}
            versions={detail.versions.map((version) => version.versionNo)}
            fromVersion={fromVersion}
            toVersion={toVersion}
            diffText={diff?.diffText ?? ""}
            reviews={reviews}
            diffLanguage={diffLanguage}
            sameVersionCode={sameVersionCode}
            sameVersionLanguage={sameVersionLanguage}
            createReviewAction={createReviewAction}
            createReplyAction={createReplyAction}
            toggleReactionAction={toggleReactionAction}
          />
        </div>
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="submission.diff.fallbackTitle">
        <ErrorState
          titleKey="submission.diff.errorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}

async function resolveVersionCode(
  submissionId: string,
  latestCode: string,
  versionNo: number,
  currentVersionNo: number,
): Promise<string> {
  if (versionNo === 0) return "";
  if (versionNo === currentVersionNo) return latestCode;
  const version = await getSubmissionVersion(submissionId, versionNo);
  return version.code;
}

async function resolveVersionData(
  submissionId: string,
  detail: Awaited<ReturnType<typeof getSubmission>>,
  versionNo: number,
): Promise<{ language: string; code: string }> {
  if (versionNo === detail.currentVersionNo) {
    return { language: detail.language, code: detail.latestCode };
  }
  return getSubmissionVersion(submissionId, versionNo);
}
