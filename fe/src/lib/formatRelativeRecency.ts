// 알림·피드에서 짧은 상대 시각 문자열을 만듭니다.
export function formatRelativeRecency(iso: string, locale: string): string {
  const thenMs = new Date(iso).getTime();
  if (Number.isNaN(thenMs)) return "";
  const diffMs = thenMs - Date.now();
  const loc = locale.toLowerCase().startsWith("ko") ? "ko" : "en";
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const abs = Math.abs(diffMs);
  if (abs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (abs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (abs < 30 * day) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  return new Intl.DateTimeFormat(loc, { month: "short", day: "numeric" }).format(new Date(iso));
}
