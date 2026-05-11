// 세션 데이터 모델 타입입니다.
import type { OAuthProvider } from "@psstudio/shared";

export type SessionData = {
  userId: string;
  provider: OAuthProvider;
  createdAt: number;
  lastSeenAt: number;
};
