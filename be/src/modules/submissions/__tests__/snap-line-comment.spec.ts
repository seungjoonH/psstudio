// AI 라인 코멘트 줄 스냅·검증 헬퍼 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import {
  snapLineCommentOffWhitespaceOnlyRange,
  snapLineCommentRangeToAnchorMatch,
} from "../submissions.service.js";

describe("snapLineCommentOffWhitespaceOnlyRange", () => {
  it("빈 줄만 범위면 다음 비주석 코드 줄로 내린다", () => {
    const lines = ["for (;;) {", "", "  if (x) break;", "}"];
    const out = snapLineCommentOffWhitespaceOnlyRange(
      { startLine: 2, endLine: 2, anchorText: "if", body: "x" },
      lines,
    );
    expect(out.startLine).toBe(3);
    expect(out.endLine).toBe(3);
  });

  it("코드가 있는 범위는 그대로 둔다", () => {
    const lines = ["a", "b"];
    const orig = { startLine: 1, endLine: 1, anchorText: "a", body: "x" };
    expect(snapLineCommentOffWhitespaceOnlyRange(orig, lines)).toEqual(orig);
  });
});

describe("snapLineCommentRangeToAnchorMatch", () => {
  it("anchor 가 현재 범위 밖에만 있으면 매칭 줄로 옮긴다", () => {
    const lines = ["for (let i=0;;) {", "", "  if (z) {}"]; // LLM이 실수로 startLine 2만 준 경우
    const out = snapLineCommentRangeToAnchorMatch(
      { startLine: 2, endLine: 2, anchorText: "if (z)", body: "y" },
      lines,
    );
    expect(out.startLine).toBe(3);
    expect(out.endLine).toBe(3);
  });
});
