// 과제별 제출 목록 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../../src/auth/api.server";
import { getAssignment } from "../../../../../../src/assignments/server";
import { getGroup } from "../../../../../../src/groups/server";
import { listSubmissions } from "../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../../src/ui/states/ErrorState";
import { SubmissionsListClient } from "./SubmissionsListClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string; assignmentId: string }>;
  searchParams?: Promise<{ sort?: string; language?: string; isLate?: string; authorId?: string }>;
};

export default async function SubmissionsListPage({ params, searchParams }: Props) {
  const { groupId, assignmentId } = await params;
  const sp = (await searchParams) ?? {};
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const sort = sp.sort === "createdAtDesc" ? "createdAtDesc" : "createdAtAsc";
    const [group, a, items] = await Promise.all([
      getGroup(groupId),
      getAssignment(assignmentId),
      listSubmissions(assignmentId, {
        sort,
        language: sp.language,
        authorId: sp.authorId,
        isLate: sp.isLate === undefined ? undefined : sp.isLate === "true",
      }),
    ]);

    return (
      <SubmissionsListClient
        groupId={groupId}
        groupName={group.name}
        assignmentId={assignmentId}
        assignmentTitle={a.title}
        sort={sort}
        items={items}
      />
    );
  } catch (error) {
    return (
      <AppShell titleKey="submission.fallbackTitle">
        <ErrorState
          titleKey="submission.list.errorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}
