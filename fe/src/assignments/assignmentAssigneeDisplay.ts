// 과제 대상자 전원·그룹 전체 배정 여부를 판별하는 헬퍼입니다.

export function isAssignedToWholeGroup(
  assigneeUserIds: string[],
  memberUserIds: string[],
): boolean {
  if (memberUserIds.length === 0 || assigneeUserIds.length !== memberUserIds.length) {
    return false;
  }
  const assigneeSet = new Set(assigneeUserIds);
  return memberUserIds.every((userId) => assigneeSet.has(userId));
}

export type AssigneeMatchMode = "any" | "all";

export function matchesAssigneeFilter(
  assigneeUserIds: string[],
  selectedAssigneeIds: string[],
  mode: AssigneeMatchMode = "any",
): boolean {
  if (selectedAssigneeIds.length === 0) return true;
  if (mode === "all") {
    return selectedAssigneeIds.every((userId) => assigneeUserIds.includes(userId));
  }
  return selectedAssigneeIds.some((userId) => assigneeUserIds.includes(userId));
}
