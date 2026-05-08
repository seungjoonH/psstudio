// AI 리뷰 JSON 파싱 순수 함수 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { parseAiReviewPayload } from "../submissions.service.js";

describe("parseAiReviewPayload", () => {
  it("코드펜스 안 JSON에 body에 백틱 펜스가 있어도 균형 추출로 파싱한다", () => {
    const payload = {
      summary: "요약",
      lineComments: [
        {
          startLine: 1,
          endLine: 1,
          anchorText: "print",
          body: "문제: a\n\n근거: b\n\n개선: c\n\n```python\nx = 1\n```",
        },
      ],
    };
    const json = JSON.stringify(payload);
    const raw = "```json\n" + json + "\n```";
    const out = parseAiReviewPayload(raw);
    expect(out.summary).toBe("요약");
    expect(out.lineComments.length).toBe(1);
    expect(out.lineComments[0].body).toContain("```python");
  });

  it("summary에 전체 JSON 봉투가 들어와도 lineComments는 살린다", () => {
    const inner = {
      summary: "짧은 요약",
      lineComments: [
        {
          startLine: 2,
          endLine: 2,
          anchorText: "x",
          body: "문제: p\n\n근거: q\n\n개선: r\n\n개선할 수 있습니다.",
        },
      ],
    };
    const envelope = JSON.stringify({
      summary: JSON.stringify(inner),
      lineComments: [],
    });
    const out = parseAiReviewPayload(envelope);
    expect(out.lineComments.length).toBe(1);
    expect(out.summary).toBe("짧은 요약");
  });

  it("봉투 summary만 있고 내부에 lineComments가 있으면 살린다", () => {
    const inner = {
      summary: "내부 요약",
      lineComments: [
        {
          startLine: 1,
          endLine: 1,
          anchorText: "a",
          body: "문제: p\n\n근거: q\n\n개선: r",
        },
      ],
    };
    const raw = JSON.stringify({ summary: JSON.stringify(inner), lineComments: [] });
    const out = parseAiReviewPayload(raw);
    expect(out.summary).toBe("내부 요약");
    expect(out.lineComments.length).toBe(1);
  });
});
