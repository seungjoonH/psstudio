// KST 기준 날짜와 시간을 locale별로 포맷합니다.
import type { Locale } from "./messages";

export function formatKstDateTime(value: Date | string | number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
