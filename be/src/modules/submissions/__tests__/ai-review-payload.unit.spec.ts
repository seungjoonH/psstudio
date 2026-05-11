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

  it("문자열 값 안에 실제 줄바꿈이 있어도 jsonrepair로 파싱한다", () => {
    const raw = [
      '{"summary":"요약","lineComments":[',
      '{"startLine":1,"endLine":1,"anchorText":"","body":"문제: a',
      "",
      "근거: b",
      "",
      '개선: c"}]}',
    ].join("\n");
    const out = parseAiReviewPayload(raw);
    expect(out.summary).toBe("요약");
    expect(out.lineComments.length).toBe(1);
    expect(out.lineComments[0].body).toContain("문제:");
  });

  it("후행 쉼표가 있어도 파싱한다", () => {
    const raw =
      '{"summary":"요약","lineComments":[{"startLine":1,"endLine":1,"anchorText":"x","body":"문제: p\\n\\n근거: q\\n\\n개선: r",},]}';
    const out = parseAiReviewPayload(raw);
    expect(out.summary).toBe("요약");
    expect(out.lineComments.length).toBe(1);
  });

  it("startAnchorText와 제출 원문으로 줄 번호를 확정한다", () => {
    const code = ["function x() {", "  return 1;", "}", "for (let i=0;i<3;i++) {", "  a++;", "}"].join("\n");
    const raw = JSON.stringify({
      summary: "요약",
      lineComments: [{ body: "루프 문제", startAnchorText: "for (let i=0;i<3;i++) {" }],
    });
    const out = parseAiReviewPayload(raw, code);
    expect(out.lineComments.length).toBe(1);
    expect(out.lineComments[0].startLine).toBe(4);
    expect(out.lineComments[0].endLine).toBe(4);
    expect(out.lineComments[0].anchorText).toContain("for");
  });
});
