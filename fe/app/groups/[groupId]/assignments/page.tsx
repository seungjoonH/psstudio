// 그룹 내 과제 목록 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../src/auth/api.server";
import { getGroup } from "../../../../src/groups/server";
import { listAssignments } from "../../../../src/assignments/server";
import { listSubmissions } from "../../../../src/submissions/server";
import { listGroupMembers } from "../../../../src/groups/server";
import { AppShell } from "../../../../src/shell/AppShell";
import { ErrorState } from "../../../../src/ui/states/ErrorState";
import { AssignmentsListClient } from "./AssignmentsListClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ groupId: string }> };

export default async function AssignmentsListPage({ params }: Props) {
  const { groupId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, items, members] = await Promise.all([
      getGroup(groupId),
      listAssignments(groupId),
      listGroupMembers(groupId),
    ]);
    const itemWithSubmission = await Promise.all(
      items.map(async (item) => {
        const submissions = await listSubmissions(item.id, { sort: "createdAtDesc" });
        const submitterIds = Array.from(new Set(submissions.map((submission) => submission.authorUserId)));
        return {
          ...item,
          hasMySubmission: submitterIds.includes(me.id),
          submitterIds,
        };
      }),
    );
    const canCreate = group.myRole === "OWNER" || group.myRole === "MANAGER";
    return (
      <AssignmentsListClient
        groupId={groupId}
        groupName={group.name}
        items={itemWithSubmission}
        members={members}
        canCreate={canCreate}
      />
    );
  } catch (error) {
    return (
      <AppShell titleKey="assignment.fallbackTitle">
        <ErrorState
          titleKey="assignment.list.errorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}
