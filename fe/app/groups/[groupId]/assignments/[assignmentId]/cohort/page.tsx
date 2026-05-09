// 그룹 과제 집단 코드 비교 전용 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../../src/auth/api.server";
import { getAssignment, getCohortAnalysis, type CohortAnalysisDto } from "../../../../../../src/assignments/server";
import { getGroup } from "../../../../../../src/groups/server";
import { listSubmissions } from "../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../../src/ui/states/ErrorState";
import { GroupSubnavCluster } from "../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../GroupRouteBreadcrumbs";
import { CohortAnalysisClient } from "./CohortAnalysisClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string; assignmentId: string }>;
};

export default async function CohortAnalysisPage({ params }: Props) {
  const { groupId, assignmentId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, a, submissions] = await Promise.all([
      getGroup(groupId),
      getAssignment(assignmentId),
      listSubmissions(assignmentId, { sort: "createdAtAsc" }),
    ]);

    if (a.groupId !== groupId) {
      redirect("/");
    }

    let cohortInitial: CohortAnalysisDto = { status: "NONE" };
    try {
      cohortInitial = await getCohortAnalysis(assignmentId);
    } catch {
      cohortInitial = { status: "NONE" };
    }

    const due = new Date(a.dueAt);
    const duePassed = Date.now() >= due.getTime();
    const langOk = group.rules.translationLanguage !== "none";
    const canStartCohort = langOk && duePassed && submissions.length >= 2;

    return (
      <AppShell titleKey="assignment.cohortPage.shellTitle" titleVars={{ name: group.name }}>
        <GroupSubnavCluster groupId={groupId}>
          <GroupRouteBreadcrumbs groupId={groupId} assignmentTitle={a.title} />
        </GroupSubnavCluster>
        <CohortAnalysisClient
          groupId={groupId}
          assignmentId={assignmentId}
          assignmentTitle={a.title}
          cohortInitial={cohortInitial}
          canStartCohort={canStartCohort}
        />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="assignment.fallbackTitle">
        <ErrorState titleKey="assignment.detail.errorTitle" description={(error as Error).message} />
      </AppShell>
    );
  }
}
