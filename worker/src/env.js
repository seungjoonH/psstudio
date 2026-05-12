// 워커 환경변수를 fallback 없이 읽는 유틸입니다.
export function readRequiredEnv(key) {
  const value = process.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }
  return value;
}
