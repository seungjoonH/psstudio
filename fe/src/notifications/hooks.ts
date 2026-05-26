"use client";
// 알림 서버 상태의 React Query 훅과 무효화 규칙을 제공합니다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
} from "./api.client";
import { notificationQueryKeys } from "./queryKeys";
import type { NotificationListItem } from "./types";

export function useNotificationsQuery(limit: number, initialData?: NotificationListItem[]) {
  return useQuery({
    queryKey: notificationQueryKeys.list(limit),
    queryFn: () => fetchNotifications(limit),
    initialData,
  });
}

export function useUnreadNotificationCountQuery(initialData?: number) {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: fetchUnreadNotificationCount,
    initialData,
  });
}

export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() }),
    ]);
  };
}

export function useDeleteNotificationMutation() {
  const invalidateNotifications = useInvalidateNotifications();
  return useMutation({
    mutationFn: deleteNotification,
    onSuccess: invalidateNotifications,
  });
}

export function useDeleteAllNotificationsMutation() {
  const invalidateNotifications = useInvalidateNotifications();
  return useMutation({
    mutationFn: deleteAllNotifications,
    onSuccess: invalidateNotifications,
  });
}
