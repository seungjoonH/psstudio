// 그룹 역할 비교 유틸의 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { hasAtLeastRole } from "../domain/roles.js";

describe("hasAtLeastRole", () => {
  it("OWNER는 MANAGER 권한도 만족한다", () => {
    expect(hasAtLeastRole("OWNER", "MANAGER")).toBe(true);
  });

  it("MEMBER는 OWNER 권한을 만족하지 못한다", () => {
    expect(hasAtLeastRole("MEMBER", "OWNER")).toBe(false);
  });

  it("같은 역할은 만족한다", () => {
    expect(hasAtLeastRole("MANAGER", "MANAGER")).toBe(true);
  });
});
