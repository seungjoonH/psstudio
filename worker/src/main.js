// AI 분석과 알림 백그라운드 작업을 처리하는 워커 진입점입니다.
import { closeDbPool } from "./db.js";
import { readRequiredEnv } from "./env.js";
import { startDeadlineReminderWorker } from "./queues/deadlineReminderQueue.js";
import { closeRedisClients } from "./redis.js";

const redisUrl = readRequiredEnv("REDIS_URL");
const databaseUrl = readRequiredEnv("DATABASE_URL");

const deadlineReminderWorker = startDeadlineReminderWorker();

deadlineReminderWorker.on("completed", (job, result) => {
  console.log(
    `[deadline-reminder] completed jobId=${job.id ?? "unknown"} createdCount=${String(result?.createdCount ?? 0)}`,
  );
});

deadlineReminderWorker.on("failed", (job, error) => {
  console.error(`[deadline-reminder] failed jobId=${job?.id ?? "unknown"}: ${error.message}`);
});

async function shutdown(signal) {
  console.log(`Worker shutting down (${signal}).`);
  await deadlineReminderWorker.close();
  await closeRedisClients();
  await closeDbPool();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.log("Worker booted.");
console.log(`Redis URL: ${redisUrl}`);
console.log(`Database URL: ${databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@")}`);
