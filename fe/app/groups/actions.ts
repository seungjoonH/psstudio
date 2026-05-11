"use server";

// 그룹 관련 서버 액션입니다.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  changeMemberRole,
  createGroup,
  deleteGroup,
  leaveGroup,
  regenerateGroupCode,
  removeMember,
  transferOwner,
  updateGroup,
} from "../../src/groups/server";
import type { CreateGroupPayload } from "../../src/groups/server";

function readCheckbox(formData: FormData, key: string, defaultOn: boolean): boolean {
  const v = formData.get(key);
  if (v === null) return defaultOn;
  return v === "on" || v === "true";
}

function readRequiredString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length === 0) return null;
  return value;
}

export async function createGroupWizardAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 20) return;
  const description = String(formData.get("description") ?? "").trim();
  const maxMembersRaw = Number(formData.get("maxMembers"));
  const maxMembers = Number.isFinite(maxMembersRaw) ? maxMembersRaw : undefined;

  const payload: CreateGroupPayload = {
    name,
    description: description.length > 0 ? description : undefined,
    maxMembers,
    joinByCodeEnabled: readCheckbox(formData, "joinByCodeEnabled", true),
    joinByLinkEnabled: readCheckbox(formData, "joinByLinkEnabled", true),
    ruleUseDeadline: readCheckbox(formData, "ruleUseDeadline", false),
    ruleDefaultDeadlineTime: String(formData.get("ruleDefaultDeadlineTime") ?? "23:59").trim() || "23:59",
    ruleAllowLateSubmission: readCheckbox(formData, "ruleAllowLateSubmission", true),
    ruleUseAiFeedback: readCheckbox(formData, "ruleUseAiFeedback", true),
    ruleAllowEditAfterSubmit: readCheckbox(formData, "ruleAllowEditAfterSubmit", true),
    ruleAssignmentCreatorRoles: String(formData.get("ruleAssignmentCreatorRoles") ?? "OWNER_AND_MANAGER"),
  };

  const created = await createGroup(payload);
  redirect(`/groups/${created.id}`);
}

export async function updateGroupAction(groupId: string, formData: FormData): Promise<void> {
  const name = readRequiredString(formData, "name");
  const ruleDefaultDeadlineTime = readRequiredString(formData, "ruleDefaultDeadlineTime");
  const ruleAssignmentCreatorRoles = readRequiredString(formData, "ruleAssignmentCreatorRoles");
  if (name === null || ruleDefaultDeadlineTime === null || ruleAssignmentCreatorRoles === null) return;
  if (name.length === 0 || name.length > 20) return;

  const description = String(formData.get("description") ?? "").trim();
  const maxMembersRaw = Number(formData.get("maxMembers"));
  const maxMembers = Number.isFinite(maxMembersRaw) ? maxMembersRaw : undefined;

  await updateGroup(groupId, {
    name,
    description,
    maxMembers,
    joinByCodeEnabled: readCheckbox(formData, "joinByCodeEnabled", false),
    joinByLinkEnabled: readCheckbox(formData, "joinByLinkEnabled", false),
    ruleUseDeadline: readCheckbox(formData, "ruleUseDeadline", false),
    ruleDefaultDeadlineTime,
    ruleAllowLateSubmission: readCheckbox(formData, "ruleAllowLateSubmission", false),
    ruleUseAiFeedback: readCheckbox(formData, "ruleUseAiFeedback", false),
    ruleAllowEditAfterSubmit: readCheckbox(formData, "ruleAllowEditAfterSubmit", false),
    ruleAssignmentCreatorRoles,
  });
  revalidatePath(`/groups/${groupId}`);
}

export async function regenerateGroupCodeAction(groupId: string): Promise<void> {
  await regenerateGroupCode(groupId);
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/invite`);
}

export async function deleteGroupAction(groupId: string, formData: FormData): Promise<void> {
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm.length === 0) return;
  await deleteGroup(groupId, confirm);
  redirect("/groups");
}

export async function changeRoleAction(groupId: string, userId: string, role: "MANAGER" | "MEMBER"): Promise<void> {
  await changeMemberRole(groupId, userId, role);
  revalidatePath(`/groups/${groupId}`);
}

export async function transferOwnerAction(groupId: string, userId: string): Promise<void> {
  await transferOwner(groupId, userId);
  revalidatePath(`/groups/${groupId}`);
}

export async function removeMemberAction(groupId: string, userId: string): Promise<void> {
  await removeMember(groupId, userId);
  revalidatePath(`/groups/${groupId}`);
}

export async function leaveGroupAction(groupId: string): Promise<void> {
  await leaveGroup(groupId);
  redirect("/groups");
}
