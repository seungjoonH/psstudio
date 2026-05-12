// 워커의 BullMQ 연결과 pub/sub 발행 Redis 클라이언트를 제공합니다.
import IORedis from "ioredis";
import { readRequiredEnv } from "./env.js";

let cachedBullConnection = null;
let cachedPublisher = null;

function buildRedisClient() {
  return new IORedis(readRequiredEnv("REDIS_URL"), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function getBullRedisConnection() {
  if (cachedBullConnection === null) {
    cachedBullConnection = buildRedisClient();
  }
  return cachedBullConnection;
}

export function getRedisPublisher() {
  if (cachedPublisher === null) {
    cachedPublisher = buildRedisClient();
  }
  return cachedPublisher;
}

export async function closeRedisClients() {
  if (cachedPublisher !== null) {
    await cachedPublisher.quit();
    cachedPublisher = null;
  }
  if (cachedBullConnection !== null) {
    await cachedBullConnection.quit();
    cachedBullConnection = null;
  }
}
