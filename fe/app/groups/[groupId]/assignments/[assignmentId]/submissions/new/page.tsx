// 새 제출 작성 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../../../src/auth/api.server";
import { getAssignment } from "../../../../../../../src/assignments/server";
import { getGroup } from "../../../../../../../src/groups/server";
import { listSubmissions } from "../../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../../../src/ui/states/ErrorState";
import { GroupSubnavCluster } from "../../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../../GroupRouteBreadcrumbs";
import { createSubmissionAction } from "../actions";
import { NewSubmissionForm } from "./NewSubmissionForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ groupId: string; assignmentId: string }> };

export default async function NewSubmissionPage({ params }: Props) {
  const { groupId, assignmentId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, assignment, mySubs] = await Promise.all([
      getGroup(groupId),
      getAssignment(assignmentId),
      listSubmissions(assignmentId, { authorId: me.id }),
    ]);
    const nextNo = mySubs.length + 1;
    return (
      <AppShell
        titleKey="assignment.list.title"
        titleVars={{ name: group.name }}
        subtitleKey="assignment.list.subtitle"
      >
        <div style={{ display: "grid", gap: 16 }}>
          <GroupSubnavCluster groupId={groupId}>
            <GroupRouteBreadcrumbs groupId={groupId} assignmentTitle={assignment.title} />
          </GroupSubnavCluster>
          <NewSubmissionForm
            action={createSubmissionAction.bind(null, groupId, assignmentId)}
            authorNickname={me.nickname}
            submissionSequenceNo={nextNo}
          />
        </div>
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="submission.new.title">
        <ErrorState titleKey="submission.new.errorTitle" description={(error as Error).message} />
      </AppShell>
    );
  }
}
