// 그룹 멤버 역할 변경 DTO입니다.
import { z } from "zod";

export const groupRoleSchema = z.enum(["OWNER", "MANAGER", "MEMBER"]);

export const updateMemberRoleDto = z.object({
  role: groupRoleSchema,
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleDto>;
