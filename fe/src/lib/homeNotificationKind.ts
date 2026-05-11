// 홈 최근 알림 배지에 매핑할 알림 유형 그룹 키를 반환합니다.
import { NOTIFICATION_TYPES } from "@psstudio/shared";

export type HomeNotificationKind =
  | "assignment"
  | "submission"
  | "comment"
  | "review"
  | "ai"
  | "announcement"
  | "join"
  | "feedback"
  | "other";

export function homeNotificationKind(type: string): HomeNotificationKind {
  switch (type) {
    case NOTIFICATION_TYPES.ASSIGNMENT_CREATED:
    case NOTIFICATION_TYPES.DEADLINE_SOON:
      return "assignment";
    case NOTIFICATION_TYPES.SUBMISSION_CREATED:
    case NOTIFICATION_TYPES.LATE_SUBMISSION_CREATED:
      return "submission";
    case NOTIFICATION_TYPES.COMMENT_ON_MY_SUBMISSION:
    case NOTIFICATION_TYPES.REPLY_ON_MY_COMMENT:
    case NOTIFICATION_TYPES.COMMUNITY_COMMENT_CREATED:
    case NOTIFICATION_TYPES.MENTIONED:
      return "comment";
    case NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION:
    case NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW:
    case NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE:
      return "review";
    case NOTIFICATION_TYPES.AI_ANALYSIS_DONE:
    case NOTIFICATION_TYPES.AI_ANALYSIS_FAILED:
    case NOTIFICATION_TYPES.PROBLEM_ANALYSIS_DONE:
    case NOTIFICATION_TYPES.PROBLEM_ANALYSIS_FAILED:
      return "ai";
    case NOTIFICATION_TYPES.ANNOUNCEMENT_CREATED:
    case NOTIFICATION_TYPES.ANNOUNCEMENT_UPDATED:
      return "announcement";
    case NOTIFICATION_TYPES.JOIN_REQUEST_CREATED:
    case NOTIFICATION_TYPES.JOIN_REQUEST_APPROVED:
    case NOTIFICATION_TYPES.JOIN_REQUEST_REJECTED:
      return "join";
    case NOTIFICATION_TYPES.FEEDBACK_OPENED:
      return "feedback";
    default:
      return "other";
  }
}
