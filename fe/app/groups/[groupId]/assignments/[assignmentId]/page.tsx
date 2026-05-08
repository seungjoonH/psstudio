// 과제 상세 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../src/auth/api.server";
import { getAssignment, getCohortAnalysis, type CohortAnalysisDto } from "../../../../../src/assignments/server";
import { getGroup } from "../../../../../src/groups/server";
import { listSubmissions } from "../../../../../src/submissions/server";
import { AppShell } from "../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../src/ui/states/ErrorState";
import { AssignmentDetailClient } from "./AssignmentDetailClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string; assignmentId: string }>;
  searchParams?: Promise<{ submissionSort?: string }>;
};

export default async function AssignmentDetailPage({ params, searchParams }: Props) {
  const { groupId, assignmentId } = await params;
  const sp = (await searchParams) ?? {};
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  const submissionSort = sp.submissionSort === "createdAtDesc" ? "createdAtDesc" : "createdAtAsc";

  try {
    const [group, a, submissions] = await Promise.all([
      getGroup(groupId),
      getAssignment(assignmentId),
      listSubmissions(assignmentId, { sort: submissionSort }),
    ]);
    let cohortInitial: CohortAnalysisDto = { status: "NONE" };
    try {
      cohortInitial = await getCohortAnalysis(assignmentId);
    } catch {
      /* 구 BE 등으로 API가 없을 때는 NONE으로 둔다. */
    }
    const canManage = group.myRole === "OWNER" || group.myRole === "MANAGER";
    return (
      <AssignmentDetailClient
        groupId={groupId}
        groupName={group.name}
        assignmentId={assignmentId}
        assignment={a}
        canManage={canManage}
        meId={me.id}
        submissions={submissions}
        submissionSort={submissionSort}
        translationLanguage={group.rules.translationLanguage}
        cohortInitial={cohortInitial}
      />
    );
  } catch (error) {
    return (
      <AppShell titleKey="assignment.fallbackTitle">
        <ErrorState
          titleKey="assignment.detail.errorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}
