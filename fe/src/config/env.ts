// 프론트엔드 환경변수를 fallback 없이 읽고 누락 시 즉시 실패시키는 단일 진입점입니다.
export function readRequiredEnv(key: string): string {
  const value = process.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }
  return value;
}

export const ENV = {
  apiBaseUrl: () => readRequiredEnv("NEXT_PUBLIC_API_BASE_URL"),
};
