// 그룹 외부 내 과제 캘린더 진입 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../src/auth/api.server";
import { listAssignments } from "../../src/assignments/server";
import { listSubmissions } from "../../src/submissions/server";
import { listMyGroups } from "../../src/groups/server";
import { AssignmentsOverviewClient } from "../../src/assignments/AssignmentsOverviewClient";
import { AppShell } from "../../src/shell/AppShell";
import { EmptyState } from "../../src/ui/states/EmptyState";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
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
    )
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const all = await Promise.all(
    allRaw.map(async (item) => {
      const mine = await listSubmissions(item.id, { authorId: me.id, sort: "createdAtDesc" });
      return { ...item, hasMySubmission: mine.length > 0 };
    }),
  );

  return (
    <AppShell titleKey="calendar.title" subtitleKey="calendar.subtitle">
      {all.length === 0 ? (
        <EmptyState titleKey="assignments.emptyTitle" descriptionKey="assignments.emptyDesc" />
      ) : (
        <AssignmentsOverviewClient
          items={all.map((item) => ({
            id: item.id,
            href: `/groups/${item.groupId}/assignments/${item.id}`,
            title: item.title,
            dueAt: item.dueAt,
            isLate: item.isLate,
            hasMySubmission: item.hasMySubmission,
            platform: item.platform,
            difficulty: item.difficulty,
            groupName: item.groupName,
            groupId: item.groupId,
            algorithms: item.metadata.algorithms ?? [],
            algorithmsHiddenUntilSubmit: item.metadata.algorithmsHiddenUntilSubmit ?? true,
            analysisStatus: item.analysisStatus,
          }))}
          mode="calendar"
        />
      )}
    </AppShell>
  );
}
