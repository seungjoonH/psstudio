// 서버 컴포넌트와 서버 액션에서 인증 쿠키와 함께 BE를 호출하는 공용 헬퍼입니다.
import { cookies } from "next/headers";
import { ENV } from "../config/env";

export function apiBase(): string {
  return ENV.apiBaseUrl();
}

export async function buildCookieHeader(): Promise<string> {
  const all = await cookies();
  return all
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload !== null && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (o.success === false && o.error !== null && typeof o.error === "object") {
      const err = o.error as Record<string, unknown>;
      if (typeof err.message === "string") return err.message;
    }
    if (typeof o.message === "string") return o.message;
    if (Array.isArray(o.message) && o.message.every((x) => typeof x === "string")) {
      return o.message.join(", ");
    }
  }
  return `요청 실패 (${status})`;
}

export async function apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {
    cookie: await buildCookieHeader(),
  };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: "no-store",
    body,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text.length === 0 ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }
  const envelope = parsed as { success?: boolean; data?: T; error?: { code: string; message: string } } | null;
  if (!res.ok || parsed === null || envelope?.success !== true) {
    const message = extractErrorMessage(parsed, res.status);
    throw new Error(message);
  }
  return envelope.data as T;
}
