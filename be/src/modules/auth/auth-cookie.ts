// 세션과 OAuth state 쿠키를 set/clear 하는 유틸입니다.
import { serialize, type SerializeOptions } from "cookie";
import type { Response } from "express";
import { ENV } from "../../config/env.js";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const STATE_MAX_AGE_SECONDS = 60 * 10;
export const STATE_COOKIE_NAME = "psstudio_oauth_state";

function commonOptions(): SerializeOptions {
  return {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
  };
}

export function setSessionCookie(res: Response, sessionId: string): void {
  const cookie = serialize(ENV.sessionCookieName(), sessionId, {
    ...commonOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  appendCookie(res, cookie);
}

export function clearSessionCookie(res: Response): void {
  const cookie = serialize(ENV.sessionCookieName(), "", {
    ...commonOptions(),
    maxAge: 0,
  });
  appendCookie(res, cookie);
}

export function setStateCookie(res: Response, state: string): void {
  const cookie = serialize(STATE_COOKIE_NAME, state, {
    ...commonOptions(),
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  appendCookie(res, cookie);
}

export function clearStateCookie(res: Response): void {
  const cookie = serialize(STATE_COOKIE_NAME, "", {
    ...commonOptions(),
    maxAge: 0,
  });
  appendCookie(res, cookie);
}

function appendCookie(res: Response, cookie: string): void {
  const prev = res.getHeader("set-cookie");
  if (prev === undefined) {
    res.setHeader("set-cookie", cookie);
    return;
  }
  if (Array.isArray(prev)) {
    res.setHeader("set-cookie", [...prev, cookie]);
    return;
  }
  res.setHeader("set-cookie", [String(prev), cookie]);
}
