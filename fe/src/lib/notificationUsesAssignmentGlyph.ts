// 알림 행 왼쪽에 과제(북) 원형 아이콘을 쓸지 여부를 판별합니다. 마감 임박은 캘린더 아이콘을 씁니다.
import { NOTIFICATION_TYPES } from "@psstudio/shared";

export function notificationUsesAssignmentGlyph(type: string): boolean {
  return type === NOTIFICATION_TYPES.ASSIGNMENT_CREATED;
}
