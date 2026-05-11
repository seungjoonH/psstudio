"use server";

// 초대 관리 서버 액션입니다.
import { revalidatePath } from "next/cache";
import { regenerateGroupCode } from "../../../../src/groups/server";
import { createInviteLink, revokeInviteLink } from "../../../../src/invites/server";

export async function regenerateCodeAction(groupId: string): Promise<void> {
  await regenerateGroupCode(groupId);
  revalidatePath(`/groups/${groupId}/invite`);
}

export async function createLinkAction(groupId: string): Promise<void> {
  await createInviteLink(groupId);
  revalidatePath(`/groups/${groupId}/invite`);
}

export async function revokeLinkAction(groupId: string, linkId: string): Promise<void> {
  await revokeInviteLink(groupId, linkId);
  revalidatePath(`/groups/${groupId}/invite`);
}
