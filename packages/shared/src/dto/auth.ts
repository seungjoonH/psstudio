// 인증과 세션 관련 DTO 스키마입니다.
import { z } from "zod";

export const oauthProviderSchema = z.enum(["google", "github"]);

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  provider: oauthProviderSchema,
  email: z.string().email(),
  nickname: z.string(),
  profileImageUrl: z.string().url(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
