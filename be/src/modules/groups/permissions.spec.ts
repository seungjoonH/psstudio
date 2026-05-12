// 권한 매트릭스 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { canPerform } from "./permissions.js";

describe("canPerform", () => {
  it("MEMBER는 그룹 보기/제출 생성을 허용한다", () => {
    expect(canPerform("MEMBER", "GROUP_VIEW")).toBe(true);
    expect(canPerform("MEMBER", "SUBMISSION_CREATE_OWN")).toBe(true);
  });

  it("MEMBER는 그룹 수정/멤버 강퇴를 허용하지 않는다", () => {
    expect(canPerform("MEMBER", "GROUP_UPDATE")).toBe(false);
    expect(canPerform("MEMBER", "GROUP_MEMBER_KICK")).toBe(false);
  });

  it("MANAGER는 강퇴/공지 작성/과제 생성을 허용한다", () => {
    expect(canPerform("MANAGER", "GROUP_MEMBER_KICK")).toBe(true);
    expect(canPerform("MANAGER", "ANNOUNCEMENT_CREATE")).toBe(true);
    expect(canPerform("MANAGER", "ASSIGNMENT_CREATE")).toBe(true);
  });

  it("역할 변경은 OWNER만 허용한다", () => {
    expect(canPerform("OWNER", "GROUP_MEMBER_ROLE_CHANGE")).toBe(true);
    expect(canPerform("MANAGER", "GROUP_MEMBER_ROLE_CHANGE")).toBe(false);
    expect(canPerform("MEMBER", "GROUP_MEMBER_ROLE_CHANGE")).toBe(false);
  });

  it("OWNER만 그룹 코드 재발급을 허용한다", () => {
    expect(canPerform("OWNER", "GROUP_INVITE_CODE_REGEN")).toBe(true);
    expect(canPerform("MANAGER", "GROUP_INVITE_CODE_REGEN")).toBe(false);
  });

  it("OWNER만 그룹 삭제와 위임을 허용한다", () => {
    expect(canPerform("OWNER", "GROUP_DELETE")).toBe(true);
    expect(canPerform("MANAGER", "GROUP_DELETE")).toBe(false);
    expect(canPerform("OWNER", "GROUP_OWNER_TRANSFER")).toBe(true);
    expect(canPerform("MANAGER", "GROUP_OWNER_TRANSFER")).toBe(false);
  });

  it("null 역할은 모든 권한을 거부한다", () => {
    expect(canPerform(null, "GROUP_VIEW")).toBe(false);
  });
});
