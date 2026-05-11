// 초대/가입 BE 호출 헬퍼입니다.
import { apiFetch } from "../api/server";

export type InviteCodeResponse = { code: string };

export type InviteLinkRow = {
  id: string;
  token: string;
  url: string;
  createdAt: string;
};

export type CreateInviteLinkResponse = { token: string; url: string };

export type InviteLinkPreview = {
  groupId: string;
  groupName: string;
};

export type InvitePreview = {
  groupId: string;
  name: string;
  description: string;
  memberCount: number;
  maxMembers: number;
  joinMethods: {
    code: boolean;
    link: boolean;
  };
};

export function getInviteCode(groupId: string): Promise<InviteCodeResponse> {
  return apiFetch(`/api/v1/groups/${groupId}/invite-code`);
}

export function regenerateGroupCode(groupId: string): Promise<{ groupCode: string }> {
  return apiFetch(`/api/v1/groups/${groupId}/code/regenerate`, { method: "POST" });
}

export function listInviteLinks(groupId: string): Promise<InviteLinkRow[]> {
  return apiFetch(`/api/v1/groups/${groupId}/invite-links`);
}

export function createInviteLink(groupId: string): Promise<CreateInviteLinkResponse> {
  return apiFetch(`/api/v1/groups/${groupId}/invite-links`, { method: "POST", json: {} });
}

export function revokeInviteLink(groupId: string, linkId: string): Promise<unknown> {
  return apiFetch(`/api/v1/groups/${groupId}/invite-links/${linkId}`, { method: "DELETE" });
}

export function previewInvite(params: { code?: string; link?: string }): Promise<InvitePreview> {
  const q = new URLSearchParams();
  if (params.code !== undefined) q.set("code", params.code);
  if (params.link !== undefined) q.set("link", params.link);
  return apiFetch(`/api/v1/invites/preview?${q.toString()}`);
}

export function resolveInviteLink(token: string): Promise<InviteLinkPreview> {
  return apiFetch(`/api/v1/invites/links/${token}`);
}

export function acceptInviteLink(token: string): Promise<{ groupId: string }> {
  return apiFetch(`/api/v1/invites/link/${token}/accept`, { method: "POST" });
}

export function acceptInviteCode(code: string): Promise<{ groupId: string }> {
  return apiFetch(`/api/v1/invites/code/accept`, { method: "POST", json: { code } });
}
