"use server";

// 알림 삭제 요청을 백엔드로 전달하는 서버 액션입니다.
import { deleteAllNotificationsServer, deleteNotificationServer } from "../../src/auth/api.server";

export async function deleteNotificationAction(notificationId: string): Promise<void> {
  await deleteNotificationServer(notificationId);
}

export async function deleteAllNotificationsAction(): Promise<void> {
  await deleteAllNotificationsServer();
}
