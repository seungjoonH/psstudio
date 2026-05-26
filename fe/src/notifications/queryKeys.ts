// 알림 서버 상태의 React Query 키를 한 곳에서 관리합니다.
export const notificationQueryKeys = {
  all: ["notifications"] as const,
  list: (limit: number) => [...notificationQueryKeys.all, "list", limit] as const,
  unreadCount: () => [...notificationQueryKeys.all, "unread-count"] as const,
};
