import { describe, expect, it } from "vitest";
import {
  assertReportMarkdownCodeFencesMatchTarget,
  normalizeCohortReportLocale,
  parseAndValidateCohortBundle,
  parseRegionsLenient,
  sanitizeCohortReportMarkdown,
} from "../cohort-analysis-bundle.js";

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
    const out = parseAndValidateCohortBundle(raw, ids, "javascript", "ko");
    expect(out.reportMarkdown).toContain("Hello");
    expect(out.artifacts.submissions).toHaveLength(2);
  });

  it("sanitizes bare uuid and submission phrase into placeholders", () => {
    const json = {
      ...validJson,
      reportMarkdown:
        "Submission aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa 와 bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb 비교",
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, "javascript", "ko");
    expect(out.reportMarkdown).toContain("[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]");
    expect(out.reportMarkdown).toContain("[[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]");
  });

  it("클램프하여 범위 밖 줄 번호도 받아들인다", () => {
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s, i) =>
        i === 0
          ? { ...s, regions: [{ roleId: "x", roleLabel: "X", startLine: 1, endLine: 99 }] }
          : { ...s, regions: [{ roleId: "x", roleLabel: "X", startLine: 1, endLine: 2 }] },
      ),
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko");
    expect(out.artifacts.submissions[0].regions[0].endLine).toBe(2);
  });

  it("목표 언어가 python일 때 Java 문법이 남아 있으면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s, i) =>
        i === 0
          ? {
              ...s,
              normalizedCode: "public class A {\n  public static void main(String[] args) {}\n}",
            }
          : s,
      ),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "python", "ko")).toThrow(
      "cohort_bundle_normalized_language_mismatch",
    );
  });

  it("pseudo 목표일 때는 언어 휴리스틱을 적용하지 않는다", () => {
    const pseudoMix = {
      ...validJson,
      submissions: validJson.submissions.map((s, i) =>
        i === 0
          ? {
              ...s,
              normalizedCode: "public class A {}\n# include is ok in pseudo notes",
              regions: [{ roleId: "chunk_one", roleLabel: "첫 구역", startLine: 1, endLine: 2 }],
            }
          : {
              ...s,
              normalizedCode: "def x():\n  pass",
              regions: [{ roleId: "chunk_one", roleLabel: "첫 구역", startLine: 1, endLine: 2 }],
            },
      ),
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(pseudoMix), ids, "pseudo", "ko");
    expect(out.artifacts.submissions).toHaveLength(2);
  });

  it("리포트 코드 펜스 태그가 목표 언어와 다르면 거절한다", () => {
    const bad = {
      ...validJson,
      reportMarkdown: "비교 ```java\nint x;\n``` [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_report_fence_mismatch",
    );
  });

  it("리포트 본문에 다른 프로그래밍 언어 이름을 쓰면 거절한다", () => {
    const pyBundle = {
      reportMarkdown:
        "[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] 은 Java로 작성된 스타일입니다.",
      submissions: validJson.submissions.map((s) => ({
        ...s,
        normalizedCode: "def x():\n    return 1\n",
        originalLanguage: "java",
        regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
      })),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(pyBundle), ids, "python", "ko")).toThrow(
      "cohort_bundle_report_original_language_mentioned",
    );
  });

  it("구역 개수가 같고 roleId 문자열만 다르면 첫 제출 슬롯 기준으로 통일한다", () => {
    const bundle = {
      ...validJson,
      submissions: [
        { ...validJson.submissions[0], regions: [{ roleId: "alpha", roleLabel: "알파", startLine: 1, endLine: 2 }] },
        { ...validJson.submissions[1], regions: [{ roleId: "beta", roleLabel: "베타", startLine: 1, endLine: 2 }] },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bundle), ids, "javascript", "ko");
    const a = out.artifacts.submissions.find((x) => x.submissionId === ids[0]);
    const b = out.artifacts.submissions.find((x) => x.submissionId === ids[1]);
    expect(a?.regions[0]?.roleId).toBe("alpha");
    expect(b?.regions[0]?.roleId).toBe("alpha");
    expect(b?.regions[0]?.roleLabel).toBe("알파");
  });

  it("제출 간 구역 개수가 다르면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: [
        {
          ...validJson.submissions[0],
          regions: [
            { roleId: "a", roleLabel: "A", startLine: 1, endLine: 1 },
            { roleId: "b", roleLabel: "B", startLine: 2, endLine: 2 },
          ],
        },
        { ...validJson.submissions[1], regions: [{ roleId: "c", roleLabel: "C", startLine: 1, endLine: 2 }] },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_regions_role_mismatch",
    );
  });

  it("구역이 6개 이상이면 거절한다", () => {
    const sixRegions = Array.from({ length: 6 }, (_, i) => ({
      roleId: `r${i}`,
      roleLabel: `R${i}`,
      startLine: i + 1,
      endLine: i + 1,
    }));
    const code = Array.from({ length: 6 }, (_, i) => `line${i}`).join("\n");
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s) => ({
        ...s,
        normalizedCode: code,
        regions: sixRegions,
      })),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_regions_count",
    );
  });

  it("긴 코드에서 한 줄짜리 구역만 있으면 거절한다", () => {
    const code12 = Array.from({ length: 12 }, (_, i) => `x${i}`).join("\n");
    const thinRegions = [
      { roleId: "r0", roleLabel: "R0", startLine: 1, endLine: 1 },
      { roleId: "r1", roleLabel: "R1", startLine: 2, endLine: 2 },
      { roleId: "r2", roleLabel: "R2", startLine: 3, endLine: 3 },
    ];
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s) => ({
        ...s,
        normalizedCode: code12,
        regions: thinRegions,
      })),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_regions_too_fine",
    );
  });

  it("한 제출에서 roleId가 중복이면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: [
        {
          ...validJson.submissions[0],
          regions: [
            { roleId: "dup", roleLabel: "A", startLine: 1, endLine: 1 },
            { roleId: "dup", roleLabel: "B", startLine: 2, endLine: 2 },
          ],
        },
        {
          ...validJson.submissions[1],
          regions: [
            { roleId: "dup", roleLabel: "A", startLine: 1, endLine: 1 },
            { roleId: "dup", roleLabel: "B", startLine: 2, endLine: 2 },
          ],
        },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_regions_duplicate_role",
    );
  });

  it("roleId whole_file 이면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s) => ({
        ...s,
        regions: [{ roleId: "whole_file", roleLabel: "X", startLine: 1, endLine: 2 }],
      })),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_regions_reserved_role",
    );
  });

  it("유효 regions가 없어 whole_file이 되면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: validJson.submissions.map((s) => ({ ...s, regions: [] })),
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, "javascript", "ko")).toThrow(
      "cohort_bundle_regions_reserved_role",
    );
  });
});

describe("assertReportMarkdownCodeFencesMatchTarget", () => {
  it("언어 태그 없는 펜스는 무시한다", () => {
    expect(() =>
      assertReportMarkdownCodeFencesMatchTarget("설명 ```\nPlain\n``` 끝", "python"),
    ).not.toThrow();
  });
});

describe("parseRegionsLenient", () => {
  it("regions가 없으면 코드 전체 구역 한 개를 둔다", () => {
    expect(parseRegionsLenient(null, "a\nb", "ko")).toEqual([
      { roleId: "whole_file", roleLabel: "코드 전체", startLine: 1, endLine: 2 },
    ]);
  });
});

describe("sanitizeCohortReportMarkdown", () => {
  const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];

  it("does not double-wrap existing placeholders", () => {
    const md = "[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]";
    expect(sanitizeCohortReportMarkdown(md, ids)).toBe(md);
  });

  it("maps submission(uuid) form", () => {
    const md = "see submission(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)";
    expect(sanitizeCohortReportMarkdown(md, ids)).toBe(
      "see [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
    );
  });
});
