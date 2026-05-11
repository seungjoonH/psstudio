// extractAssistantMessageContent 동작을 검증하는 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { extractAssistantMessageContent } from "../llm-chat-client.js";

describe("extractAssistantMessageContent", () => {
  it("문자열 content는 그대로 반환한다", () => {
    expect(extractAssistantMessageContent('{"a":1}')).toBe('{"a":1}');
  });

  it("텍스트 파트 배열을 이어 붙인다", () => {
    expect(
      extractAssistantMessageContent([
        { type: "text", text: '{"summary":' },
        { type: "text", text: '"x"}' },
      ]),
    ).toBe('{"summary":"x"}');
  });

  it("reasoning 파트는 건너뛰고 text만 모은다", () => {
    expect(
      extractAssistantMessageContent([
        { type: "reasoning", text: "think" },
        { type: "text", text: "ok" },
      ]),
    ).toBe("ok");
  });

  it("빈 입력은 빈 문자열이다", () => {
    expect(extractAssistantMessageContent(null)).toBe("");
    expect(extractAssistantMessageContent(undefined)).toBe("");
    expect(extractAssistantMessageContent([])).toBe("");
  });
});
