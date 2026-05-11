// 초대 링크/초대 코드/가입 신청 DTO입니다.
import { z } from "zod";

export const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

export const createInviteLinkDto = z.object({
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
});

export type CreateInviteLinkDto = z.infer<typeof createInviteLinkDto>;

export const joinByCodeDto = z.object({
  code: z.string().regex(INVITE_CODE_PATTERN, "초대 코드는 영문 대소문자와 숫자 8자입니다."),
});

export type JoinByCodeDto = z.infer<typeof joinByCodeDto>;
