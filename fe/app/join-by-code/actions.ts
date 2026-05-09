"use server";

// 초대 코드로 가입하는 서버 액션입니다.
import { redirect } from "next/navigation";
import { messages } from "../../src/i18n/messages";
import { acceptInviteCode } from "../../src/invites/server";

export type JoinByCodeActionState = { error?: string } | undefined;

type UiLocale = keyof typeof messages;

function readLocale(formData: FormData): UiLocale {
  const v = String(formData.get("_locale") ?? "");
  return v === "en" ? "en" : "ko";
}

export async function joinByCodeAction(
  _prev: JoinByCodeActionState,
  formData: FormData,
): Promise<JoinByCodeActionState> {
  const locale = readLocale(formData);
  const code = String(formData.get("code") ?? "").trim();
  if (!/^[A-Za-z0-9]{8}$/.test(code)) {
    return { error: messages[locale].joinByCode.invalidFormat };
  }
  let groupId: string;
  try {
    const r = await acceptInviteCode(code);
    groupId = r.groupId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : messages[locale].joinByCode.unknownError;
    return { error: msg };
  }
  redirect(`/groups/${groupId}`);
}
