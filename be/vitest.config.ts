import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(p: string): Record<string, string> {
  const text = readFileSync(p, "utf8");
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const testEnvPath = resolve(__dirname, ".env.test.local");
if (!existsSync(testEnvPath)) {
  throw new Error(
    "테스트 실행 전 be/.env.test.local 파일이 필요합니다. 개발 DB 보호를 위해 .env.local은 테스트에서 사용하지 않습니다.",
  );
}
const envFromLocal = loadDotEnv(testEnvPath);

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    globals: false,
    env: envFromLocal,
    poolOptions: {
      threads: { singleThread: true },
      forks: { singleFork: true },
    },
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/main.ts",
        "src/**/__tests__/**",
        "src/migrations/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
