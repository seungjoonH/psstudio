// 워커가 Postgres에 접근할 때 쓰는 단일 Pool입니다.
import { Pool } from "pg";
import { readRequiredEnv } from "./env.js";

let cachedPool = null;

export function getDbPool() {
  if (cachedPool === null) {
    cachedPool = new Pool({
      connectionString: readRequiredEnv("DATABASE_URL"),
    });
  }
  return cachedPool;
}

export async function closeDbPool() {
  if (cachedPool !== null) {
    await cachedPool.end();
    cachedPool = null;
  }
}
