// 알림 SSE를 구독하고 새 알림 이벤트를 콜백으로 전달하는 훅입니다.
"use client";

import { NOTIFICATION_STREAM_EVENTS, type NotificationCreatedEvent } from "@psstudio/shared";
import { useEffect, useRef } from "react";

type Options = {
  enabled?: boolean;
};

function readClientApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL 환경변수가 필요합니다.");
  }
  return value;
}

export function useNotificationStream(
  onCreated: (event: NotificationCreatedEvent) => void,
  options: Options = {},
) {
  const enabled = options.enabled ?? true;
  const onCreatedRef = useRef(onCreated);

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`${readClientApiBaseUrl()}/api/v1/notifications/stream`, {
      withCredentials: true,
    });
    const handleCreated = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as NotificationCreatedEvent;
        if (parsed.event !== NOTIFICATION_STREAM_EVENTS.CREATED) return;
        onCreatedRef.current(parsed);
      } catch {
        // 알 수 없는 메시지는 무시합니다.
      }
    };
    source.addEventListener(NOTIFICATION_STREAM_EVENTS.CREATED, handleCreated as EventListener);
    return () => {
      source.removeEventListener(NOTIFICATION_STREAM_EVENTS.CREATED, handleCreated as EventListener);
      source.close();
    };
  }, [enabled]);
}
