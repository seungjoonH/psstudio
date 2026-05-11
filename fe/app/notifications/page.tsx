// 내 알림 목록 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer, fetchRecentNotificationsServer } from "../../src/auth/api.server";
import { AppShell } from "../../src/shell/AppShell";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");
  const items = await fetchRecentNotificationsServer(100);

  return (
    <AppShell titleKey="notifications.pageTitle" subtitleKey="notifications.subtitle">
      <NotificationsClient items={items} />
    </AppShell>
  );
}
