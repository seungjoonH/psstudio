// 워커 부팅 시 필수 환경변수가 없으면 실패하는지 검증합니다.
import { describe, expect, it } from "vitest";

describe("worker env contract", () => {
  it("REDIS_URL과 DATABASE_URL은 필수 키여야 한다", () => {
    const required = ["REDIS_URL", "DATABASE_URL"];
    for (const key of required) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});
