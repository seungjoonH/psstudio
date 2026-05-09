// 그룹 API 서버 호출 헬퍼입니다.
import type { GroupRole } from "@psstudio/shared";
import { apiFetch } from "../api/server";

export type GroupMemberPreview = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
};

export type GroupListItem = {
  id: string;
  name: string;
  description: string;
  maxMembers: number;
  ownerUserId: string;
  myRole: GroupRole;
  memberCount: number;
  memberPreviews: GroupMemberPreview[];
  /** 내가 아직 제출하지 않은 활성 과제 수 */
  myPendingAssignmentCount: number;
};

export type GroupDetail = {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  myRole: GroupRole;
  groupCode: string;
  maxMembers: number;
  memberCount: number;
  joinMethods: {
    code: boolean;
    link: boolean;
    request: boolean;
    email: boolean;
  };
  rules: {
    useDeadline: boolean;
    defaultDeadlineTime: string;
    allowLateSubmission: boolean;
    useAiFeedback: boolean;
    allowEditAfterSubmit: boolean;
    assignmentCreatorRoles: string;
  };
};

export type GroupMember = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
  role: GroupRole;
  joinedAt: string;
};

export type CreateGroupPayload = {
  name: string;
  description?: string;
  maxMembers?: number;
  joinByCodeEnabled?: boolean;
  joinByLinkEnabled?: boolean;
  joinByRequestEnabled?: boolean;
  joinByEmailEnabled?: boolean;
  ruleUseDeadline?: boolean;
  ruleDefaultDeadlineTime?: string;
  ruleAllowLateSubmission?: boolean;
  ruleUseAiFeedback?: boolean;
  ruleAllowEditAfterSubmit?: boolean;
  ruleAssignmentCreatorRoles?: string;
};

export function listMyGroups(): Promise<GroupListItem[]> {
  return apiFetch("/api/v1/groups");
}

export function getGroup(groupId: string): Promise<GroupDetail> {
  return apiFetch(`/api/v1/groups/${groupId}`);
}

export function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  return apiFetch(`/api/v1/groups/${groupId}/members`);
}

export function createGroup(
  payload: CreateGroupPayload,
): Promise<{ id: string; name: string; ownerUserId: string; groupCode: string; maxMembers: number; memberCount: number }> {
  return apiFetch("/api/v1/groups", { method: "POST", json: payload });
}

export function updateGroup(groupId: string, patch: Partial<CreateGroupPayload>): Promise<unknown> {
  return apiFetch(`/api/v1/groups/${groupId}`, { method: "PATCH", json: patch });
}

export function regenerateGroupCode(groupId: string): Promise<{ groupCode: string }> {
  return apiFetch(`/api/v1/groups/${groupId}/code/regenerate`, { method: "POST" });
}

export function deleteGroup(groupId: string, confirmGroupName: string): Promise<{ deleted: true }> {
  return apiFetch(`/api/v1/groups/${groupId}`, { method: "DELETE", json: { confirmGroupName } });
}

export function changeMemberRole(groupId: string, userId: string, role: "MANAGER" | "MEMBER"): Promise<unknown> {
  return apiFetch(`/api/v1/groups/${groupId}/members/${userId}/role`, {
    method: "PATCH",
    json: { role },
  });
}

export function transferOwner(groupId: string, userId: string): Promise<unknown> {
  return apiFetch(`/api/v1/groups/${groupId}/transfer/${userId}`, { method: "POST" });
}

export function removeMember(groupId: string, userId: string): Promise<unknown> {
  return apiFetch(`/api/v1/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

export function leaveGroup(groupId: string): Promise<unknown> {
  return apiFetch(`/api/v1/groups/${groupId}/members/me`, { method: "DELETE" });
}
