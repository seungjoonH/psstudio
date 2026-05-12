// 과제 목록 진입 페이지의 자리 표시자입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../src/auth/api.server";
import { listAssignments } from "../../src/assignments/server";
import { listSubmissions } from "../../src/submissions/server";
import { listMyGroups } from "../../src/groups/server";
import { AppShell } from "../../src/shell/AppShell";
import { EmptyState } from "../../src/ui/states/EmptyState";
import { AssignmentsOverviewClient } from "../../src/assignments/AssignmentsOverviewClient";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ view?: string }>;
};

function getAssignmentSortBucket(item: {
  dueAt: string;
  hasMySubmission?: boolean;
}): 0 | 1 | 2 {
  if (item.hasMySubmission === true) return 2;
  return new Date(item.dueAt).getTime() < Date.now() ? 0 : 1;
}

export default async function AssignmentsPage({ searchParams }: Props) {
  const query = (await searchParams) ?? {};
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  const groups = await listMyGroups();
  const assignmentChunks = await Promise.all(
    groups.map(async (group) => ({
      groupId: group.id,
      groupName: group.name,
      items: await listAssignments(group.id),
    })),
  );

  const allRaw = assignmentChunks
    .flatMap((chunk) =>
      chunk.items.map((item) => ({
        ...item,
        groupId: chunk.groupId,
        groupName: chunk.groupName,
      })),
    );
  const all = await Promise.all(
    allRaw.map(async (item) => {
      const submissions = await listSubmissions(item.id, { sort: "createdAtDesc" });
      const submitterIds = Array.from(new Set(submissions.map((submission) => submission.authorUserId)));
      const hasMyLateSubmission = submissions.some(
        (submission) => submission.authorUserId === me.id && submission.isLate,
      );
      return {
        ...item,
        hasMySubmission: submitterIds.includes(me.id),
        hasMyLateSubmission,
        submitterIds,
      };
    }),
  );
  const sorted = [...all].sort((a, b) => {
    const bucketA = getAssignmentSortBucket(a);
    const bucketB = getAssignmentSortBucket(b);
    const bucketDiff = bucketA - bucketB;
    if (bucketDiff !== 0) return bucketDiff;

    if (bucketA !== 2) {
      const dueDiff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (dueDiff !== 0) return dueDiff;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <AppShell titleKey="assignments.title" subtitleKey="assignments.subtitle">
      {sorted.length === 0 ? (
        <EmptyState titleKey="assignments.emptyTitle" descriptionKey="assignments.emptyDesc" />
      ) : (
        <AssignmentsOverviewClient
          items={sorted.map((item) => ({
            id: item.id,
            href: `/groups/${item.groupId}/assignments/${item.id}`,
            title: item.title,
            dueAt: item.dueAt,
            isLate: item.isLate,
            isAssignedToMe: item.isAssignedToMe,
            hasMySubmission: item.hasMySubmission,
            hasMyLateSubmission: item.hasMyLateSubmission,
            platform: item.platform,
            difficulty: item.difficulty,
            groupName: item.groupName,
            groupId: item.groupId,
            algorithms: item.metadata.algorithms ?? [],
            algorithmsHiddenUntilSubmit: item.metadata.algorithmsHiddenUntilSubmit ?? true,
            analysisStatus: item.analysisStatus,
            submitterIds: item.submitterIds,
            assigneeUserIds: item.assigneeUserIds,
            assignees: item.assignees,
          }))}
          mode={query.view === "calendar" ? "calendar" : "list"}
        />
      )}
    </AppShell>
  );
}
