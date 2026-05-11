// 서버 컴포넌트와 서버 액션에서 BE 인증 API를 호출하는 헬퍼입니다.
import { cookies } from "next/headers";
import type { MeResponse } from "@psstudio/shared";
import { ENV } from "../config/env";

function apiBase(): string {
  return ENV.apiBaseUrl();
}

async function buildCookieHeader(): Promise<string> {
  const all = await cookies();
  return all
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function fetchMeServer(): Promise<MeResponse | null> {
  const res = await fetch(`${apiBase()}/api/v1/users/me`, {
    cache: "no-store",
    headers: { cookie: await buildCookieHeader() },
  });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as { success: boolean; data: MeResponse };
  return body.data;
}

export type HomeRecentNotification = {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  href: string | null;
  actorNickname: string | null;
  actorProfileImageUrl: string | null;
};

export type HomeRecentSubmission = {
  id: string;
  title: string;
  language: string;
  createdAt: string;
  href: string;
};

export async function fetchRecentNotificationsServer(limit = 5): Promise<HomeRecentNotification[]> {
  const res = await fetch(`${apiBase()}/api/v1/users/me/notifications?limit=${limit}`, {
    cache: "no-store",
    headers: { cookie: await buildCookieHeader() },
  });
  if (res.status === 401) return [];
  if (!res.ok) return [];
  const body = (await res.json()) as { success: boolean; data: unknown };
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.map((raw: Record<string, unknown>) => ({
    id: String(raw.id ?? ""),
    type: typeof raw.type === "string" ? raw.type : "",
    title: String(raw.title ?? ""),
    createdAt: String(raw.createdAt ?? ""),
    href: typeof raw.href === "string" && raw.href.length > 0 ? raw.href : null,
    actorNickname: typeof raw.actorNickname === "string" ? raw.actorNickname : null,
    actorProfileImageUrl:
      typeof raw.actorProfileImageUrl === "string" && raw.actorProfileImageUrl.length > 0
        ? raw.actorProfileImageUrl
        : null,
  }));
}

export async function deleteNotificationServer(notificationId: string): Promise<void> {
  const res = await fetch(
    `${apiBase()}/api/v1/users/me/notifications/${encodeURIComponent(notificationId)}`,
    {
      method: "DELETE",
      cache: "no-store",
      headers: { cookie: await buildCookieHeader() },
    },
  );
  if (res.status === 401) throw new Error("로그인이 필요합니다.");
  if (res.status === 404) throw new Error("알림을 찾을 수 없습니다.");
  if (!res.ok) throw new Error("알림 삭제에 실패했습니다.");
}

export async function deleteAllNotificationsServer(): Promise<void> {
  const res = await fetch(`${apiBase()}/api/v1/users/me/notifications`, {
    method: "DELETE",
    cache: "no-store",
    headers: { cookie: await buildCookieHeader() },
  });
  if (res.status === 401) throw new Error("로그인이 필요합니다.");
  if (!res.ok) throw new Error("알림 삭제에 실패했습니다.");
}

export async function fetchRecentSubmissionsServer(
  limit = 5,
  opts?: { createdAfter?: string },
): Promise<HomeRecentSubmission[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: "createdAtDesc",
  });
  if (opts?.createdAfter !== undefined && opts.createdAfter.length > 0) {
    params.set("createdAfter", opts.createdAfter);
  }
  const res = await fetch(`${apiBase()}/api/v1/users/me/submissions?${params.toString()}`, {
    cache: "no-store",
    headers: { cookie: await buildCookieHeader() },
  });
  if (res.status === 401) return [];
  if (!res.ok) return [];
  const body = (await res.json()) as { success: boolean; data: HomeRecentSubmission[] };
  return Array.isArray(body.data) ? body.data : [];
}

export async function updateNicknameServer(nickname: string): Promise<MeResponse> {
  const res = await fetch(`${apiBase()}/api/v1/users/me`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      cookie: await buildCookieHeader(),
    },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) {
    let message = "닉네임 저장 실패";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (typeof body.error?.message === "string" && body.error.message.length > 0) {
        message = body.error.message;
      }
    } catch {
      /* ignore parse error */
    }
    throw new Error(message);
  }
  const body = (await res.json()) as { success: boolean; data: MeResponse };
  return body.data;
}

type SetCookie = { name: string; value: string; maxAge?: number };

function parseSetCookieHeaders(raw: string[]): SetCookie[] {
  const out: SetCookie[] = [];
  for (const line of raw) {
    const parts = line.split(";").map((p) => p.trim());
    const [first, ...rest] = parts;
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const cookie: SetCookie = {
      name: first.slice(0, eq),
      value: first.slice(eq + 1),
    };
    for (const attr of rest) {
      const [k, v] = attr.split("=");
      if (k.toLowerCase() === "max-age" && v !== undefined) {
        cookie.maxAge = Number(v);
      }
    }
    out.push(cookie);
  }
  return out;
}

export async function logoutServer(): Promise<void> {
  const res = await fetch(`${apiBase()}/api/v1/auth/logout`, {
    method: "POST",
    cache: "no-store",
    headers: { cookie: await buildCookieHeader() },
  });
  if (!res.ok) throw new Error("로그아웃 실패");
  const setCookies = res.headers.getSetCookie();
  await applySetCookies(setCookies);
}

export async function deleteMeServer(): Promise<void> {
  const res = await fetch(`${apiBase()}/api/v1/users/me`, {
    method: "DELETE",
    cache: "no-store",
    headers: { cookie: await buildCookieHeader() },
  });
  if (!res.ok) throw new Error("탈퇴 실패");
  const setCookies = res.headers.getSetCookie();
  await applySetCookies(setCookies);
}

async function applySetCookies(raw: string[]): Promise<void> {
  const store = await cookies();
  for (const cookie of parseSetCookieHeaders(raw)) {
    if (cookie.maxAge === 0) {
      store.delete(cookie.name);
      continue;
    }
    store.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: cookie.maxAge,
    });
  }
}
