import { describe, expect, it } from "vitest";
import { normalizeLlmMarkdown } from "./normalizeLlmMarkdown";

describe("normalizeLlmMarkdown", () => {
  it("줄 안에 붙은 펜스 시작을 분리한다", () => {
    const out = normalizeLlmMarkdown("패치 예시: ```javascript\nconst x = 1;\n```");
    expect(out).toBe("패치 예시:\n\n```javascript\nconst x = 1;\n```");
  });

  it("<br />를 줄바꿈으로 바꾼다", () => {
    expect(normalizeLlmMarkdown("a<br />b")).toBe("a\nb");
    expect(normalizeLlmMarkdown("a<BR/>b")).toBe("a\nb");
  });

  it("펜스만 있는 줄은 건드리지 않는다", () => {
    expect(normalizeLlmMarkdown("  ```javascript")).toBe("  ```javascript");
  });
});
