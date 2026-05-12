// deadline 임박 알림 큐와 이벤트 상수를 공용으로 정의합니다.
import type { NotificationType } from "./notification.js";

export const DEADLINE_REMINDER_QUEUE_NAME = "notify.deadline-soon";
export const NOTIFICATION_EVENTS_CHANNEL = "notifications.events";

export const DEADLINE_REMINDER_LEAD_TIMES_MINUTES = [60, 1440] as const;
export type DeadlineReminderLeadTimeMinutes = (typeof DEADLINE_REMINDER_LEAD_TIMES_MINUTES)[number];

export const NOTIFICATION_STREAM_EVENTS = {
  CREATED: "notification.created",
} as const;

export type NotificationStreamEventName =
  (typeof NOTIFICATION_STREAM_EVENTS)[keyof typeof NOTIFICATION_STREAM_EVENTS];

export type NotificationCreatedEvent = {
  event: typeof NOTIFICATION_STREAM_EVENTS.CREATED;
  recipientUserId: string;
  notificationId: string;
  notificationType: NotificationType;
  groupId?: string;
  assignmentId?: string;
  leadTimeMinutes?: DeadlineReminderLeadTimeMinutes;
};

export type DeadlineReminderJobData = {
  assignmentId: string;
  dueAtIso: string;
  leadTimeMinutes: DeadlineReminderLeadTimeMinutes;
};

export function buildDeadlineReminderJobId(
  assignmentId: string,
  leadTimeMinutes: DeadlineReminderLeadTimeMinutes,
): string {
  return `deadline:${assignmentId}:${leadTimeMinutes}`;
}
