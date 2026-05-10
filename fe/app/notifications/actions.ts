// 알림 삭제 서버 액션입니다.
"use server";

import { revalidatePath } from "next/cache";
import { deleteAllNotificationsServer, deleteNotificationServer } from "../../src/auth/api.server";

export async function deleteNotificationAction(notificationId: string): Promise<void> {
  await deleteNotificationServer(notificationId);
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function deleteAllNotificationsAction(): Promise<void> {
  await deleteAllNotificationsServer();
  revalidatePath("/notifications");
  revalidatePath("/");
}
