// 응답 헬퍼의 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { fail, ok } from "../api/response.js";

describe("response helpers", () => {
  it("ok는 success true와 data를 반환한다", () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
  });

  it("fail은 code/message/details를 포함한다", () => {
    expect(fail("VALIDATION_ERROR", "잘못된 값", { key: "x" })).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "잘못된 값", details: { key: "x" } },
    });
  });
});
