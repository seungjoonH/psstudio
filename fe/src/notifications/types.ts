// 알림 UI와 클라이언트 캐시에서 공유하는 알림 행 타입입니다.
export type NotificationListItem = {
  id: string;
  type: string;
  title: string;
  isRead: boolean;
  createdAt: string;
  href: string | null;
  actorNickname: string | null;
  actorProfileImageUrl: string | null;
};
