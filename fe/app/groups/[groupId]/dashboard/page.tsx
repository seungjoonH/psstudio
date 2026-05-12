// 그룹 대시보드 화면에서 제출 통계와 그래프를 렌더링합니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../src/auth/api.server";
import { listAssignments } from "../../../../src/assignments/server";
import { getGroup, listGroupMembers } from "../../../../src/groups/server";
import { AppShell } from "../../../../src/shell/AppShell";
import { listSubmissions } from "../../../../src/submissions/server";
import { ErrorState } from "../../../../src/ui/states/ErrorState";
import { GroupRouteBreadcrumbs } from "../GroupRouteBreadcrumbs";
import { GroupSubnavCluster } from "../GroupSubnavCluster";
import { GroupDashboardClient, type DashboardAssignment, type DashboardMember, type DashboardSubmission } from "./GroupDashboardClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupDashboardPage({ params }: Props) {
  const { groupId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, members, assignments] = await Promise.all([
      getGroup(groupId),
      listGroupMembers(groupId),
      listAssignments(groupId),
    ]);
    const submissionBuckets = await Promise.all(assignments.map((assignment) => listSubmissions(assignment.id)));
    const submissions: DashboardSubmission[] = submissionBuckets.flat().map((submission) => ({
      id: submission.id,
      assignmentId: submission.assignmentId,
      authorUserId: submission.authorUserId,
      authorNickname: submission.authorNickname,
      isLate: submission.isLate,
      createdAt: submission.createdAt,
      language: submission.language,
    }));
    const assignmentRows: DashboardAssignment[] = assignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      platform: assignment.platform,
      dueAt: assignment.dueAt,
      isLate: assignment.isLate,
      assigneeUserIds: assignment.assigneeUserIds,
    }));
    const memberRows: DashboardMember[] = members.map((member) => ({
      userId: member.userId,
      nickname: member.nickname,
      profileImageUrl: member.profileImageUrl,
      role: member.role,
      joinedAt: member.joinedAt,
    }));

    return (
      <AppShell titleKey="groupDashboard.title" titleVars={{ name: group.name }} subtitleKey="groupDashboard.subtitle">
        <GroupSubnavCluster groupId={groupId}>
          <GroupRouteBreadcrumbs groupId={groupId} />
        </GroupSubnavCluster>
        <GroupDashboardClient groupId={groupId} members={memberRows} assignments={assignmentRows} submissions={submissions} />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="groupDashboard.fallbackTitle">
        <ErrorState titleKey="groupDashboard.errorTitle" description={(error as Error).message} />
      </AppShell>
    );
  }
}
