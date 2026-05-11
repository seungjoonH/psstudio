// 초대 링크 진입 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../src/auth/api.server";
import { resolveInviteLink } from "../../../src/invites/server";
import { AppShell } from "../../../src/shell/AppShell";
import { ErrorState } from "../../../src/ui/states/ErrorState";
import { acceptLinkFormAction } from "./actions";
import { InviteLandingClient } from "./InviteLandingClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function InviteLandingPage({ params }: Props) {
  const { token } = await params;
  const me = await fetchMeServer();
  if (me === null) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  try {
    const info = await resolveInviteLink(token);
    return (
      <AppShell titleKey="invite.link.title" subtitleKey="invite.link.subtitle">
        <InviteLandingClient
          groupName={info.groupName}
          acceptAction={acceptLinkFormAction}
          token={token}
        />
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="invite.link.title">
        <ErrorState titleKey="invite.link.errorTitle" description={(error as Error).message} />
      </AppShell>
    );
  }
}
