// 새 그룹 만들기와 초대 코드 가입을 안내하는 그룹 홈 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../src/auth/api.server";
import { listMyGroups } from "../../../src/groups/server";
import { GroupsExploreView } from "./GroupsExploreView";

export const dynamic = "force-dynamic";

export default async function GroupsExplorePage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");
  const groups = await listMyGroups();
  return <GroupsExploreView groups={groups} />;
}
