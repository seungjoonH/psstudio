// 서버 컴포넌트에서 기본 언어 문자열을 조회합니다.
import { DEFAULT_LOCALE, FALLBACK_LOCALE, messages } from "./messages";

function resolveMessage(locale: keyof typeof messages, key: string) {
  const parts = key.split(".");
  let current: unknown = messages[locale];

  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : null;
}

export function serverT(key: string) {
  return resolveMessage(DEFAULT_LOCALE, key) ?? resolveMessage(FALLBACK_LOCALE, key) ?? key;
}
