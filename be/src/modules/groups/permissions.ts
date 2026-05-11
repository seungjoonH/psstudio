// 그룹 권한을 한 곳에서 판정하는 단일 함수입니다.
import type { GroupRole } from "@psstudio/shared";
import { hasAtLeastRole } from "@psstudio/shared";

export type Permission =
  | "GROUP_VIEW"
  | "GROUP_UPDATE"
  | "GROUP_DELETE"
  | "GROUP_MEMBER_LIST"
  | "GROUP_MEMBER_KICK"
  | "GROUP_MEMBER_ROLE_CHANGE"
  | "GROUP_OWNER_TRANSFER"
  | "GROUP_INVITE_CREATE"
  | "GROUP_INVITE_REVOKE"
  | "GROUP_INVITE_CODE_REGEN"
  | "GROUP_JOIN_REQUEST_DECIDE"
  | "ASSIGNMENT_CREATE"
  | "ASSIGNMENT_UPDATE"
  | "ASSIGNMENT_DELETE"
  | "ASSIGNMENT_METADATA_EDIT"
  | "SUBMISSION_LIST"
  | "SUBMISSION_CREATE_OWN"
  | "SUBMISSION_UPDATE_OWN"
  | "SUBMISSION_DELETE_OWN"
  | "SUBMISSION_DELETE_ANY"
  | "REVIEW_CREATE"
  | "REVIEW_DELETE_OWN"
  | "REVIEW_HIDE_ANY"
  | "ANNOUNCEMENT_CREATE"
  | "ANNOUNCEMENT_UPDATE"
  | "ANNOUNCEMENT_DELETE"
  | "COMMUNITY_POST_DELETE_ANY";

export function canPerform(role: GroupRole | null, permission: Permission): boolean {
  if (role === null) return false;
  switch (permission) {
    case "GROUP_VIEW":
    case "GROUP_MEMBER_LIST":
    case "SUBMISSION_LIST":
    case "SUBMISSION_CREATE_OWN":
    case "SUBMISSION_UPDATE_OWN":
    case "SUBMISSION_DELETE_OWN":
    case "REVIEW_CREATE":
    case "REVIEW_DELETE_OWN":
      return true;
    case "GROUP_UPDATE":
    case "GROUP_INVITE_CREATE":
    case "GROUP_INVITE_REVOKE":
    case "GROUP_JOIN_REQUEST_DECIDE":
    case "GROUP_MEMBER_KICK":
    case "GROUP_MEMBER_ROLE_CHANGE":
    case "ASSIGNMENT_CREATE":
    case "ASSIGNMENT_UPDATE":
    case "ASSIGNMENT_DELETE":
    case "ASSIGNMENT_METADATA_EDIT":
    case "SUBMISSION_DELETE_ANY":
    case "REVIEW_HIDE_ANY":
    case "ANNOUNCEMENT_CREATE":
    case "ANNOUNCEMENT_UPDATE":
    case "ANNOUNCEMENT_DELETE":
    case "COMMUNITY_POST_DELETE_ANY":
      return hasAtLeastRole(role, "MANAGER");
    case "GROUP_INVITE_CODE_REGEN":
      return role === "OWNER";
    case "GROUP_DELETE":
    case "GROUP_OWNER_TRANSFER":
      return role === "OWNER";
  }
}
