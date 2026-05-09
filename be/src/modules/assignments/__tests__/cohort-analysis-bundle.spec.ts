import { describe, expect, it } from "vitest";
import { normalizeCohortReportLocale, parseAndValidateCohortBundle } from "../cohort-analysis-bundle.js";

describe("normalizeCohortReportLocale", () => {
  it("defaults to ko when header missing", () => {
    expect(normalizeCohortReportLocale(undefined)).toBe("ko");
  });
  it("maps Korean prefix", () => {
    expect(normalizeCohortReportLocale("ko-KR,en;q=0.9")).toBe("ko");
  });
  it("falls back to en for English", () => {
    expect(normalizeCohortReportLocale("en-US")).toBe("en");
  });
});

describe("parseAndValidateCohortBundle", () => {
  const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"].sort();

  const validJson = {
    reportMarkdown: "Hello [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
    submissions: [
      {
        submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        normalizedCode: "line1\nline2",
        originalLanguage: "javascript",
        regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
      },
      {
        submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        normalizedCode: "a\nb",
        originalLanguage: "javascript",
        regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
      },
    ],
  };

  it("parses minimal fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify(validJson) + "\n```";
    const out = parseAndValidateCohortBundle(raw, ids, "javascript");
    expect(out.reportMarkdown).toContain("Hello");
    expect(out.artifacts.submissions).toHaveLength(2);
  });

  it("throws when line out of range", () => {
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s, i) =>
        i === 0 ? { ...s, regions: [{ roleId: "x", roleLabel: "X", startLine: 1, endLine: 99 }] } : s,
      ),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript")).toThrow();
  });
});
