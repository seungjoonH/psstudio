// 그룹 캘린더·과제 개요 주간 헤더에 쓰는, 같은 해 안에서 년도를 생략한 범위 문자열입니다.
export function formatCalendarWeekRangeLabel(localeTag: string, weekStart: Date, weekEnd: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  const fmt = new Intl.DateTimeFormat(localeTag, opts);
  return `${fmt.format(weekStart)} - ${fmt.format(weekEnd)}`;
}
