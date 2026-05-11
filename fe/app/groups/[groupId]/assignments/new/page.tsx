// 과제 생성 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../../src/auth/api.server";
import { getGroup } from "../../../../../src/groups/server";
import { AppShell } from "../../../../../src/shell/AppShell";
import { ErrorState } from "../../../../../src/ui/states/ErrorState";
import { autofillAssignmentAction, createAssignmentAction } from "../actions";
import { GroupSubnavCluster } from "../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../GroupRouteBreadcrumbs";
import { NewAssignmentForm } from "./NewAssignmentForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ dueDate?: string }>;
};

export default async function NewAssignmentPage({ params, searchParams }: Props) {
  const { groupId } = await params;
  const query = (await searchParams) ?? {};
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  let group: Awaited<ReturnType<typeof getGroup>>;
  try {
    group = await getGroup(groupId);
  } catch (error) {
    return (
      <AppShell titleKey="assignment.new.fallbackTitle">
        <ErrorState
          titleKey="assignment.new.groupErrorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
  if (group.myRole !== "OWNER" && group.myRole !== "MANAGER") {
    return (
      <AppShell titleKey="assignment.new.fallbackTitle">
        <ErrorState
          titleKey="assignment.new.permTitle"
          descriptionKey="assignment.new.permDesc"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      titleKey="assignment.list.title"
      titleVars={{ name: group.name }}
      subtitleKey="assignment.list.subtitle"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <GroupSubnavCluster groupId={groupId}>
          <GroupRouteBreadcrumbs groupId={groupId} />
        </GroupSubnavCluster>
        <NewAssignmentForm
          action={createAssignmentAction.bind(null, groupId)}
          autofillAction={autofillAssignmentAction.bind(null, groupId)}
          defaultDueTime={group.rules.defaultDeadlineTime}
          initialDueDate={query.dueDate}
        />
      </div>
    </AppShell>
  );
}
