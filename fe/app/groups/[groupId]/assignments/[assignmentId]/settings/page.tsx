// 과제 설정/메타데이터 수정/삭제 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../../src/auth/api.server";
import { getGroup, listGroupMembers } from "../../../../../../src/groups/server";
import { getAssignment, getDeletionImpact } from "../../../../../../src/assignments/server";
import { AppShell } from "../../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../../src/ui/states/ErrorState";
import { AssignmentSettingsClient } from "./AssignmentSettingsClient";
import {
  autofillAssignmentAction,
  deleteAssignmentAction,
  updateAssignmentCombinedAction,
} from "../../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ groupId: string; assignmentId: string }> };

export default async function AssignmentSettingsPage({ params }: Props) {
  const { groupId, assignmentId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, a, impact, members] = await Promise.all([
      getGroup(groupId),
      getAssignment(assignmentId),
      getDeletionImpact(assignmentId).catch(() => ({ submissionCount: 0, reviewCount: 0, commentCount: 0 })),
      listGroupMembers(groupId),
    ]);
    if (group.myRole !== "OWNER" && group.myRole !== "MANAGER") {
      return (
        <AppShell titleKey="assignment.settings.fallbackTitle">
          <ErrorState
            titleKey="assignment.settings.permTitle"
            descriptionKey="assignment.settings.permDesc"
          />
        </AppShell>
      );
    }
    return (
      <AppShell titleKey="assignment.list.title" titleVars={{ name: group.name }} subtitleKey="assignment.list.subtitle">
        <AssignmentSettingsClient
          groupId={groupId}
          assignment={a}
          impact={impact}
          members={members}
          meUserId={me.id}
          myRole={group.myRole}
          actions={{
            update: updateAssignmentCombinedAction.bind(null, groupId, assignmentId),
            autofill: autofillAssignmentAction.bind(null, groupId),
            deleteAssignment: deleteAssignmentAction.bind(null, groupId, assignmentId),
          }}
        />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="assignment.settings.fallbackTitle">
        <ErrorState
          titleKey="assignment.settings.loadErrorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}
