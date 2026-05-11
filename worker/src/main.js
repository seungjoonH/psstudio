// AI 분석과 알림 백그라운드 작업을 처리하는 워커 진입점입니다.
function readRequiredEnv(key) {
  const value = process.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }
  return value;
}

const redisUrl = readRequiredEnv("REDIS_URL");
const databaseUrl = readRequiredEnv("DATABASE_URL");

console.log("Worker booted.");
console.log(`Redis URL: ${redisUrl}`);
console.log(`Database URL: ${databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@")}`);

setInterval(() => {
  console.log("Worker heartbeat.");
}, 60_000);
