// 그룹 캘린더·과제 개요 주간 헤더용 KST 범위 문자열입니다.
import type { Locale } from "../i18n/messages";
import { formatKstWeekRangeLabel } from "../i18n/formatDateTime";

export function formatCalendarWeekRangeLabel(locale: Locale, weekStart: Date, weekEnd: Date): string {
  return formatKstWeekRangeLabel(weekStart, weekEnd, locale);
}
