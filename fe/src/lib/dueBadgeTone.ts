// 마감까지 남은 일수와 지각 여부로 D-day 배지 색상 톤을 결정합니다.
import type { BadgeTone } from "../ui/Badge";

/** D-8+ 회색, D-7~D-4 노랑, D-3·D-2 주황, D-1·D-day 빨강, 마감 후 검정 */
export function dueBadgeTone(isLate: boolean, daysLeft: number): BadgeTone {
  if (isLate) return "duePast";
  if (daysLeft <= 1) return "dueHot";
  if (daysLeft <= 3) return "dueOrange";
  if (daysLeft <= 7) return "dueWarm";
  return "dueIdle";
}
