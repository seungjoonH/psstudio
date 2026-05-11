// 알림 행 왼쪽에 과제 원형 아이콘을 쓸지 여부를 판별합니다.
import { NOTIFICATION_TYPES } from "@psstudio/shared";

export function notificationUsesAssignmentGlyph(type: string): boolean {
  return type === NOTIFICATION_TYPES.ASSIGNMENT_CREATED || type === NOTIFICATION_TYPES.DEADLINE_SOON;
}
