// 내 사용자 정보를 표시하고 닉네임 수정/탈퇴를 수행하는 화면입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../src/auth/api.server";
import { AppShell } from "../../src/shell/AppShell";
import { handleDelete, handleLogout, handleNicknameUpdate } from "./actions";
import { MeClient } from "./MeClient";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  return (
    <AppShell titleKey="me.title">
      <MeClient
        me={me}
        handleNicknameUpdate={handleNicknameUpdate}
        handleLogout={handleLogout}
        handleDelete={handleDelete}
      />
    </AppShell>
  );
}
