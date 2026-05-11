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
    )
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const all = await Promise.all(
    allRaw.map(async (item) => {
      const mine = await listSubmissions(item.id, { authorId: me.id, sort: "createdAtDesc" });
      return { ...item, hasMySubmission: mine.length > 0 };
    }),
  );

  return (
    <AppShell titleKey="assignments.title" subtitleKey="assignments.subtitle">
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
          mode={query.view === "calendar" ? "calendar" : "list"}
        />
      )}
    </AppShell>
  );
}
