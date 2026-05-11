// 그룹 생성/수정/삭제 DTO입니다.
import { z } from "zod";

export const GROUP_NAME_MAX = 20;

export const createGroupDto = z.object({
  name: z.string().trim().min(1).max(GROUP_NAME_MAX),
});

export type CreateGroupDto = z.infer<typeof createGroupDto>;

export const updateGroupDto = z.object({
  name: z.string().trim().min(1).max(GROUP_NAME_MAX),
});

export type UpdateGroupDto = z.infer<typeof updateGroupDto>;

export const deleteGroupDto = z.object({
  confirmGroupName: z.string().min(1).max(GROUP_NAME_MAX),
});

export type DeleteGroupDto = z.infer<typeof deleteGroupDto>;
