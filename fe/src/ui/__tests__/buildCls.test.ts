// buildCls 유틸 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { buildCls } from "../../lib/buildCls";

describe("buildCls", () => {
  it("falsy 값을 제외한 클래스명을 공백으로 합친다", () => {
    expect(buildCls("a", "b", null, undefined, false, "c")).toBe("a b c");
  });

  it("모두 비어 있으면 빈 문자열이다", () => {
    expect(buildCls("", null, undefined)).toBe("");
  });
});
