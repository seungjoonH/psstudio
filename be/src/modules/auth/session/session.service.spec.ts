// SessionService 단위 테스트입니다.
import { describe, expect, it, vi } from "vitest";

const fakeStore = new Map<string, string>();

vi.mock("../../../shared/redis/redis.client.js", () => ({
  redisClient: {
    set: vi.fn(async (key: string, value: string) => {
      fakeStore.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => fakeStore.get(key) ?? null),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (fakeStore.delete(k)) n++;
      return n;
    }),
    scan: vi.fn(async () => ["0", [...fakeStore.keys()].filter((k) => k.startsWith("session:"))]),
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => fakeStore.get(k) ?? null)),
  },
}));

const { SessionService } = await import("./session.service.js");

describe("SessionService", () => {
  it("create/get/destroy 사이클이 정상 동작한다", async () => {
    fakeStore.clear();
    const svc = new SessionService();
    const id = await svc.create({ userId: "u1", provider: "google" });
    const got = await svc.get(id);
    expect(got?.userId).toBe("u1");
    expect(got?.provider).toBe("google");
    await svc.destroy(id);
    expect(await svc.get(id)).toBeNull();
  });

  it("touch는 lastSeenAt을 갱신한다", async () => {
    fakeStore.clear();
    const svc = new SessionService();
    const id = await svc.create({ userId: "u1", provider: "github" });
    const before = (await svc.get(id))!.lastSeenAt;
    await new Promise((r) => setTimeout(r, 5));
    const touched = await svc.touch(id);
    expect(touched?.lastSeenAt).toBeGreaterThan(before);
  });

  it("destroyAllForUser는 동일 사용자 세션을 모두 삭제한다", async () => {
    fakeStore.clear();
    const svc = new SessionService();
    const a = await svc.create({ userId: "u1", provider: "google" });
    const b = await svc.create({ userId: "u1", provider: "github" });
    const c = await svc.create({ userId: "u2", provider: "google" });
    await svc.destroyAllForUser("u1");
    expect(await svc.get(a)).toBeNull();
    expect(await svc.get(b)).toBeNull();
    expect(await svc.get(c)).not.toBeNull();
  });
});
