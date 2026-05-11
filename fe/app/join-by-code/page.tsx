// 초대 코드 입력 가입 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../src/auth/api.server";
import { AppShell } from "../../src/shell/AppShell";
import { JoinByCodePageForm } from "./JoinByCodePageForm";

export const dynamic = "force-dynamic";

export default async function JoinByCodePage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login?next=%2Fjoin-by-code");

  return (
    <AppShell titleKey="joinByCode.title" subtitleKey="joinByCode.pageSubtitle">
      <JoinByCodePageForm />
    </AppShell>
  );
}
