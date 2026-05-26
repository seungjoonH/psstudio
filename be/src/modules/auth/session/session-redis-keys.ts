// Redis 세션 키 네이밍과 TTL 정책을 한 곳에서 관리합니다.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_KEY_PREFIX = "session";
export const SESSION_SCAN_PATTERN = `${SESSION_KEY_PREFIX}:*`;

export function sessionRedisKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}:${sessionId}`;
}
