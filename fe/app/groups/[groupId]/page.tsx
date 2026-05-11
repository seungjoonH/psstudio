// 그룹 상세 화면입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../src/auth/api.server";
import { getGroup, listGroupMembers } from "../../../src/groups/server";
import { listInviteLinks } from "../../../src/invites/server";
import { AppShell } from "../../../src/shell/AppShell";
import { ErrorState } from "../../../src/ui/states/ErrorState";
import {
  changeRoleAction,
  deleteGroupAction,
  leaveGroupAction,
  regenerateGroupCodeAction,
  removeMemberAction,
  transferOwnerAction,
  updateGroupAction,
} from "../actions";
import { GroupDetailClient } from "./GroupDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ groupId: string }> };

export default async function GroupDetailPage({ params }: Props) {
  const { groupId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  let group: Awaited<ReturnType<typeof getGroup>>;
  let members: Awaited<ReturnType<typeof listGroupMembers>>;
  let links: Awaited<ReturnType<typeof listInviteLinks>> = [];
  try {
    [group, members] = await Promise.all([getGroup(groupId), listGroupMembers(groupId)]);
    links = await listInviteLinks(groupId).catch(() => []);
  } catch (error) {
    return (
      <AppShell titleKey="group.fallbackTitle">
        <ErrorState titleKey="group.errorLoad" description={(error as Error).message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={group.name}
      subtitleKey="group.subtitle"
      subtitleVars={{ count: group.memberCount, max: group.maxMembers }}
    >
      <GroupDetailClient
        meId={me.id}
        group={group}
        members={members}
        links={links}
        actions={{
          updateGroup: updateGroupAction,
          regenerateGroupCode: regenerateGroupCodeAction,
          deleteGroup: deleteGroupAction,
          changeRole: changeRoleAction,
          transferOwner: transferOwnerAction,
          removeMember: removeMemberAction,
          leaveGroup: leaveGroupAction,
        }}
      />
    </AppShell>
  );
}
