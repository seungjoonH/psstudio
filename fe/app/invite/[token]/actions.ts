"use server";

// 초대 링크 수락 서버 액션입니다.
import { redirect } from "next/navigation";
import { acceptInviteLink } from "../../../src/invites/server";

export async function acceptLinkAction(token: string): Promise<void> {
  const r = await acceptInviteLink(token);
  redirect(`/groups/${r.groupId}`);
}

export async function acceptLinkFormAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  await acceptLinkAction(token);
}
