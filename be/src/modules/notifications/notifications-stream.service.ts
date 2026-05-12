// Redis pub/sub 알림 이벤트를 SSE 연결별로 fan-out 하는 서비스입니다.
import { Injectable, MessageEvent, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  NOTIFICATION_EVENTS_CHANNEL,
  NOTIFICATION_STREAM_EVENTS,
  type NotificationCreatedEvent,
} from "@psstudio/shared";
import type { Redis } from "ioredis";
import { Subject } from "rxjs";
import { redisClient } from "../../shared/redis/redis.client.js";

function isNotificationCreatedEvent(value: unknown): value is NotificationCreatedEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.event === NOTIFICATION_STREAM_EVENTS.CREATED &&
    typeof candidate.recipientUserId === "string" &&
    candidate.recipientUserId.length > 0 &&
    typeof candidate.notificationId === "string" &&
    candidate.notificationId.length > 0 &&
    typeof candidate.notificationType === "string" &&
    candidate.notificationType.length > 0
  );
}

@Injectable()
export class NotificationsStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly userStreams = new Map<string, Set<Subject<MessageEvent>>>();
  private subscriber: Redis | null = null;

  async onModuleInit(): Promise<void> {
    this.subscriber = redisClient.duplicate();
    this.subscriber.on("message", (channel: string, message: string) => {
      if (channel !== NOTIFICATION_EVENTS_CHANNEL) return;
      this.handlePubSubMessage(message);
    });
    await this.subscriber.subscribe(NOTIFICATION_EVENTS_CHANNEL);
  }

  async onModuleDestroy(): Promise<void> {
    for (const subjects of this.userStreams.values()) {
      for (const subject of subjects) {
        subject.complete();
      }
    }
    this.userStreams.clear();
    if (this.subscriber !== null) {
      await this.subscriber.unsubscribe(NOTIFICATION_EVENTS_CHANNEL);
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  register(userId: string): Subject<MessageEvent> {
    const stream = new Subject<MessageEvent>();
    const subjects = this.userStreams.get(userId) ?? new Set<Subject<MessageEvent>>();
    subjects.add(stream);
    this.userStreams.set(userId, subjects);
    return stream;
  }

  unregister(userId: string, stream: Subject<MessageEvent>): void {
    const subjects = this.userStreams.get(userId);
    if (subjects === undefined) return;
    subjects.delete(stream);
    stream.complete();
    if (subjects.size === 0) {
      this.userStreams.delete(userId);
    }
  }

  private handlePubSubMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isNotificationCreatedEvent(parsed)) return;
      const subjects = this.userStreams.get(parsed.recipientUserId);
      if (subjects === undefined || subjects.size === 0) return;
      for (const subject of subjects) {
        subject.next({
          type: parsed.event,
          data: parsed,
        });
      }
    } catch {
      // 다른 메시지 형식은 무시합니다.
    }
  }
}
