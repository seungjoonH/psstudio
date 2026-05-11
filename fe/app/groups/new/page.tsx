// 새 그룹 생성 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../src/auth/api.server";
import { AppShell } from "../../../src/shell/AppShell";
import { createGroupWizardAction } from "../actions";
import { NewGroupForm } from "./NewGroupForm";

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  return (
    <AppShell titleKey="groupNew.title">
      <NewGroupForm action={createGroupWizardAction} />
    </AppShell>
  );
}
