// AuthService 단위 테스트입니다.
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

function makeService() {
  const google = {
    buildAuthorizeUrl: vi.fn(() => "https://google.example/auth?state=abc"),
    exchangeCodeForProfile: vi.fn(async () => ({
      providerUserId: "g-1",
      email: "g@example.com",
      displayName: "G",
      profileImageUrl: "https://img/g",
    })),
  };
  const github = {
    buildAuthorizeUrl: vi.fn(() => "https://github.example/auth?state=abc"),
    exchangeCodeForProfile: vi.fn(async () => ({
      providerUserId: "h-1",
      email: "h@example.com",
      displayName: "H",
      profileImageUrl: "https://img/h",
    })),
  };
  const usersService = {
    upsertByProviderIdentity: vi.fn(async (p: { provider: string }) => ({
      id: `user-${p.provider}`,
      provider: p.provider,
    })),
  };
  const sessionService = {
    create: vi.fn(async () => "session-token"),
  };
  const service = new AuthService(
    google as never,
    github as never,
    usersService as never,
    sessionService as never,
  );
  return { service, google, github, usersService, sessionService };
}

describe("AuthService", () => {
  it("parseProvider는 google/github만 허용한다", () => {
    const { service } = makeService();
    expect(service.parseProvider("google")).toBe("google");
    expect(service.parseProvider("github")).toBe("github");
    expect(() => service.parseProvider("kakao")).toThrow();
  });

  it("buildAuthorizeUrl은 provider별 클라이언트로 위임한다", () => {
    const { service, google, github } = makeService();
    expect(service.buildAuthorizeUrl("google", "s")).toContain("google.example");
    expect(service.buildAuthorizeUrl("github", "s")).toContain("github.example");
    expect(google.buildAuthorizeUrl).toHaveBeenCalledWith("s");
    expect(github.buildAuthorizeUrl).toHaveBeenCalledWith("s");
  });

  it("completeOAuth는 사용자 upsert와 세션 발급을 호출한다", async () => {
    const { service, google, usersService, sessionService } = makeService();
    const result = await service.completeOAuth("google", "code-xyz");
    expect(google.exchangeCodeForProfile).toHaveBeenCalledWith("code-xyz");
    expect(usersService.upsertByProviderIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", providerUserId: "g-1", email: "g@example.com" }),
    );
    expect(sessionService.create).toHaveBeenCalledWith({ userId: "user-google", provider: "google" });
    expect(result).toEqual({ sessionId: "session-token", userId: "user-google" });
  });
});
