// DB와 Redis 연결 상태를 검증하는 서비스입니다.
import { Injectable } from "@nestjs/common";
import { dataSource } from "../../config/data-source.js";
import { redisClient } from "../../shared/redis/redis.client.js";

@Injectable()
export class HealthService {
  async checkDb(): Promise<{ ok: true }> {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    await dataSource.query("SELECT 1");
    return { ok: true };
  }

  async checkRedis(): Promise<{ ok: true }> {
    const pong = await redisClient.ping();
    if (pong !== "PONG") {
      throw new Error("redis ping returned unexpected response");
    }
    return { ok: true };
  }
}
