// 블록 주석 줄 마스크 유틸 테스트입니다.
import { describe, expect, it } from "vitest";
import { computeJsTsBlockCommentLineMask } from "../jsBlockCommentLineMask";

describe("computeJsTsBlockCommentLineMask", () => {
  it("/* 와 */ 사이 줄을 표시한다", () => {
    const lines = ["const x = 1;", "/*", "  노트", "*/", "return x;"];
    const mask = computeJsTsBlockCommentLineMask(lines);
    expect(mask).toEqual([false, true, true, true, false]);
  });

  it("코드와 같은 줄의 블록 주석은 마스크하지 않는다", () => {
    const lines = ["const a = 1; /* end */"];
    const mask = computeJsTsBlockCommentLineMask(lines);
    expect(mask).toEqual([false]);
  });
});
