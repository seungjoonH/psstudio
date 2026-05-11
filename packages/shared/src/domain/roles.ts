// 그룹 역할 enum과 비교 유틸입니다.
export const GROUP_ROLES = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  MEMBER: "MEMBER",
} as const;

export type GroupRole = keyof typeof GROUP_ROLES;

const ROLE_LEVEL: Record<GroupRole, number> = {
  OWNER: 3,
  MANAGER: 2,
  MEMBER: 1,
};

export function hasAtLeastRole(actor: GroupRole, required: GroupRole): boolean {
  return ROLE_LEVEL[actor] >= ROLE_LEVEL[required];
}
