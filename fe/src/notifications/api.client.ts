// 브라우저에서 알림 API를 호출하는 클라이언트 전용 헬퍼입니다.
import type { NotificationListItem } from "./types";

function readClientApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL 환경변수가 필요합니다.");
  }
  return value;
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (res.ok && body.success === true) return body.data as T;
  throw new Error(body.error?.message ?? `요청 실패 (${res.status})`);
}

function normalizeNotification(raw: Record<string, unknown>): NotificationListItem {
  return {
    id: String(raw.id ?? ""),
    type: typeof raw.type === "string" ? raw.type : "",
    title: String(raw.title ?? ""),
    isRead: raw.isRead === true,
    createdAt: String(raw.createdAt ?? ""),
    href: typeof raw.href === "string" && raw.href.length > 0 ? raw.href : null,
    actorNickname: typeof raw.actorNickname === "string" ? raw.actorNickname : null,
    actorProfileImageUrl:
      typeof raw.actorProfileImageUrl === "string" && raw.actorProfileImageUrl.length > 0
        ? raw.actorProfileImageUrl
        : null,
  };
}

export async function fetchNotifications(limit: number): Promise<NotificationListItem[]> {
  const res = await fetch(`${readClientApiBaseUrl()}/api/v1/users/me/notifications?limit=${limit}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (res.status === 401) return [];
  const rows = await readEnvelope<unknown[]>(res);
  return Array.isArray(rows)
    ? rows.map((raw) => normalizeNotification(raw as Record<string, unknown>))
    : [];
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetch(`${readClientApiBaseUrl()}/api/v1/users/me/notifications/unread-count`, {
    cache: "no-store",
    credentials: "include",
  });
  if (res.status === 401) return 0;
  const data = await readEnvelope<{ count?: unknown }>(res);
  return typeof data.count === "number" ? data.count : 0;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const res = await fetch(
    `${readClientApiBaseUrl()}/api/v1/users/me/notifications/${encodeURIComponent(notificationId)}`,
    {
      method: "DELETE",
      cache: "no-store",
      credentials: "include",
    },
  );
  await readEnvelope<{ ok: true }>(res);
}

export async function deleteAllNotifications(): Promise<void> {
  const res = await fetch(`${readClientApiBaseUrl()}/api/v1/users/me/notifications`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "include",
  });
  await readEnvelope<{ ok: true }>(res);
}
