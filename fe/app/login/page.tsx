// 로그인 진입 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../src/auth/api.server";
import { ENV } from "../../src/config/env";
import { AppShell } from "../../src/shell/AppShell";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const me = await fetchMeServer();
  if (me !== null) redirect("/me");
  return (
    <AppShell titleKey="login.pageTitle" subtitleKey="login.pageSubtitle">
      <LoginClient apiBase={ENV.apiBaseUrl()} />
    </AppShell>
  );
}
