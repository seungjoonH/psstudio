// Redis 기반 세션 저장소 서비스입니다.
import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { redisClient } from "../../../shared/redis/redis.client.js";
import type { SessionData } from "./session.types.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class SessionService {
  async create(data: Omit<SessionData, "createdAt" | "lastSeenAt">): Promise<string> {
    const sessionId = randomBytes(32).toString("hex");
    const now = Date.now();
    const payload: SessionData = {
      ...data,
      createdAt: now,
      lastSeenAt: now,
    };
    await redisClient.set(this.key(sessionId), JSON.stringify(payload), "EX", SESSION_TTL_SECONDS);
    return sessionId;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const raw = await redisClient.get(this.key(sessionId));
    if (raw === null) return null;
    return JSON.parse(raw) as SessionData;
  }

  async touch(sessionId: string): Promise<SessionData | null> {
    const data = await this.get(sessionId);
    if (data === null) return null;
    data.lastSeenAt = Date.now();
    await redisClient.set(this.key(sessionId), JSON.stringify(data), "EX", SESSION_TTL_SECONDS);
    return data;
  }

  async destroy(sessionId: string): Promise<void> {
    await redisClient.del(this.key(sessionId));
  }

  async destroyAllForUser(userId: string): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = await redisClient.scan(cursor, "MATCH", "session:*", "COUNT", 200);
      cursor = next;
      if (keys.length === 0) continue;
      const values = await redisClient.mget(...keys);
      const toDelete: string[] = [];
      for (let i = 0; i < keys.length; i++) {
        const raw = values[i];
        if (raw === null) continue;
        try {
          const parsed = JSON.parse(raw) as SessionData;
          if (parsed.userId === userId) toDelete.push(keys[i]);
        } catch {
          continue;
        }
      }
      if (toDelete.length > 0) await redisClient.del(...toDelete);
    } while (cursor !== "0");
  }

  private key(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
