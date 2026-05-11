// 그룹 탭 진입 시 내가 속한 그룹 목록 화면을 렌더링합니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../src/auth/api.server";
import { listMyGroups } from "../../src/groups/server";
import { AppShell } from "../../src/shell/AppShell";
import { ErrorState } from "../../src/ui/states/ErrorState";
import { GroupsExploreView } from "./explore/GroupsExploreView";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  let groups: Awaited<ReturnType<typeof listMyGroups>>;
  try {
    groups = await listMyGroups();
  } catch (error) {
    return (
      <AppShell titleKey="groups.title">
        <ErrorState titleKey="groups.loadError" description={(error as Error).message} />
      </AppShell>
    );
  }

  return <GroupsExploreView groups={groups} />;
}
