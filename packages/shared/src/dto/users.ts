// 사용자 정보 수정 DTO입니다.
import { z } from "zod";

export const updateNicknameDto = z.object({
  nickname: z.string().trim().min(1).max(50),
});

export type UpdateNicknameDto = z.infer<typeof updateNicknameDto>;
