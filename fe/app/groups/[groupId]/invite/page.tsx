// 그룹 초대 코드와 초대 링크 관리 화면입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../src/auth/api.server";
import { getGroup } from "../../../../src/groups/server";
import { listInviteLinks } from "../../../../src/invites/server";
import { AppShell } from "../../../../src/shell/AppShell";
import { ErrorState } from "../../../../src/ui/states/ErrorState";
import { InviteManageClient } from "./InviteManageClient";
import { createLinkAction, regenerateCodeAction, revokeLinkAction } from "./actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ groupId: string }> };

export default async function InviteManagePage({ params }: Props) {
  const { groupId } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const group = await getGroup(groupId);
    const links = await listInviteLinks(groupId).catch(() => []);

    return (
      <AppShell
        titleKey="invite.managePage.title"
        titleVars={{ name: group.name }}
        subtitleKey="invite.managePage.subtitle"
      >
        <InviteManageClient
          groupId={groupId}
          inviteCode={{ code: group.groupCode }}
          links={links}
          actions={{
            regenerateCode: regenerateCodeAction,
            createLink: createLinkAction,
            revokeLink: revokeLinkAction,
          }}
        />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="invite.managePage.fallbackTitle">
        <ErrorState
          titleKey="invite.managePage.errorTitle"
          description={(error as Error).message}
        />
      </AppShell>
    );
  }
}
