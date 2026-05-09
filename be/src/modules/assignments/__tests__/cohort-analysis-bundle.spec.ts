import { describe, expect, it } from "vitest";
import {
  cohortSubmissionLinesFromSource,
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
  const codeA = "line1\nline2";
  const codeB = "a\nb";
  const codeById = new Map<string, string>([
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", codeA],
    ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", codeB],
  ]);

  const validJson = {
    reportMarkdown: "Hello [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
    submissions: [
      {
        submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
      },
      {
        submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
      },
    ],
  };

  it("parses minimal fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify(validJson) + "\n```";
    const out = parseAndValidateCohortBundle(raw, ids, codeById, "ko");
    expect(out.reportMarkdown).toContain("Hello");
    expect(out.artifacts.submissions).toHaveLength(2);
    expect(out.artifacts.submissions[0].regions).toHaveLength(1);
  });

  it("sanitizes bare uuid and submission phrase into placeholders", () => {
    const json = {
      ...validJson,
      reportMarkdown:
        "Submission aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa 와 bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb 비교",
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.reportMarkdown).toContain("[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]");
    expect(out.reportMarkdown).toContain("[[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]");
  });

  it("클램프하여 범위 밖 줄 번호도 받아들인다", () => {
    const bad = {
      ...validJson,
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [{ roleId: "x", roleLabel: "X", startLine: 1, endLine: 99 }],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [{ roleId: "x", roleLabel: "X", startLine: 1, endLine: 2 }],
        },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bad), ids, codeById, "ko");
    expect(out.artifacts.submissions[0].regions[0].endLine).toBe(2);
  });

  it("파일 끝 줄바꿈이 있어도 LLM lines 배열과 같은 원문 줄 수로 클램프한다", () => {
    const codeWithTrailingNl = "line1\nline2\n";
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", codeWithTrailingNl],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "x\ny\n"],
    ]);
    const bundle = {
      reportMarkdown: "x",
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [{ roleId: "a", roleLabel: "A", startLine: 1, endLine: 3 }],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [{ roleId: "a", roleLabel: "A", startLine: 1, endLine: 2 }],
        },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bundle), ids, map, "ko");
    const a = out.artifacts.submissions.find((x) => x.submissionId === ids[0]);
    expect(a?.regions[0]?.endLine).toBe(3);
  });

  it("리포트에 여러 언어 펜스가 있어도 거절하지 않는다", () => {
    const json = {
      ...validJson,
      reportMarkdown: "비교 ```java\nint x;\n``` [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.reportMarkdown).toContain("```java");
  });

  it("리포트 본문에 Java 등 언어 이름을 써도 거절하지 않는다", () => {
    const json = {
      reportMarkdown:
        "[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] 은 Java 스타일과 비슷합니다.",
      submissions: validJson.submissions,
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.reportMarkdown).toContain("Java");
  });

  it("구역 개수가 같고 roleId 문자열만 다르면 첫 제출 슬롯 기준으로 통일한다", () => {
    const bundle = {
      ...validJson,
      submissions: [
        { submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", regions: [{ roleId: "alpha", roleLabel: "알파", startLine: 1, endLine: 2 }] },
        { submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", regions: [{ roleId: "beta", roleLabel: "베타", startLine: 1, endLine: 2 }] },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bundle), ids, codeById, "ko");
    const a = out.artifacts.submissions.find((x) => x.submissionId === ids[0]);
    const b = out.artifacts.submissions.find((x) => x.submissionId === ids[1]);
    expect(a?.regions[0]?.roleId).toBe("alpha");
    expect(b?.regions[0]?.roleId).toBe("alpha");
    expect(b?.regions[0]?.roleLabel).toBe("알파");
  });

  it("파일에서 구역의 위·아래 순서가 달라도 roleId 집합이 같으면 줄 범위는 유지되고 라벨만 첫 제출과 통일된다", () => {
    const codeA = Array.from({ length: 30 }, (_, i) => `a${i}`).join("\n");
    const codeB = Array.from({ length: 30 }, (_, i) => `b${i}`).join("\n");
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", codeA],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", codeB],
    ]);
    const bundle = {
      reportMarkdown: "x",
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [
            { roleId: "weekday_filter", roleLabel: "평일 필터", startLine: 9, endLine: 10 },
            { roleId: "main_loop", roleLabel: "주요 루프", startLine: 12, endLine: 18 },
          ],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [
            { roleId: "main_loop", roleLabel: "루프", startLine: 5, endLine: 15 },
            { roleId: "weekday_filter", roleLabel: "필터", startLine: 17, endLine: 22 },
          ],
        },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bundle), ids, map, "ko");
    const b = out.artifacts.submissions.find((x) => x.submissionId === ids[1]);
    expect(b?.regions[0]?.roleId).toBe("weekday_filter");
    expect(b?.regions[0]?.roleLabel).toBe("평일 필터");
    expect(b?.regions[0]?.startLine).toBe(17);
    expect(b?.regions[0]?.endLine).toBe(22);
    expect(b?.regions[1]?.roleId).toBe("main_loop");
    expect(b?.regions[1]?.roleLabel).toBe("주요 루프");
    expect(b?.regions[1]?.startLine).toBe(5);
    expect(b?.regions[1]?.endLine).toBe(15);
  });

  it("제출 간 구역 개수가 다르면 서버에서 분할·병합해 첫 제출 개수에 맞춘다", () => {
    const bad = {
      ...validJson,
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [
            { roleId: "a", roleLabel: "A", startLine: 1, endLine: 1 },
            { roleId: "b", roleLabel: "B", startLine: 2, endLine: 2 },
          ],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [{ roleId: "c", roleLabel: "C", startLine: 1, endLine: 2 }],
        },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bad), ids, codeById, "ko");
    expect(out.artifacts.submissions).toHaveLength(2);
    expect(out.artifacts.submissions[0].regions).toHaveLength(2);
    expect(out.artifacts.submissions[1].regions).toHaveLength(2);
    expect(out.artifacts.submissions[1].regions[0]?.roleId).toBe("a");
  });

  it("구역이 6개 이상이면 거절한다", () => {
    const sixRegions = Array.from({ length: 6 }, (_, i) => ({
      roleId: `r${i}`,
      roleLabel: `R${i}`,
      startLine: i + 1,
      endLine: i + 1,
    }));
    const code = Array.from({ length: 6 }, (_, i) => `line${i}`).join("\n");
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code],
    ]);
    const bad = {
      ...validJson,
      submissions: [
        { submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", regions: sixRegions },
        { submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", regions: sixRegions },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, map, "ko")).toThrow(
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
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code12],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code12],
    ]);
    const bad = {
      ...validJson,
      submissions: [
        { submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", regions: thinRegions },
        { submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", regions: thinRegions },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, map, "ko")).toThrow(
      "cohort_bundle_regions_too_fine",
    );
  });

  it("한 제출에서 roleId가 중복이면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [
            { roleId: "dup", roleLabel: "A", startLine: 1, endLine: 1 },
            { roleId: "dup", roleLabel: "B", startLine: 2, endLine: 2 },
          ],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [
            { roleId: "dup", roleLabel: "A", startLine: 1, endLine: 1 },
            { roleId: "dup", roleLabel: "B", startLine: 2, endLine: 2 },
          ],
        },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, codeById, "ko")).toThrow(
      "cohort_bundle_regions_duplicate_role",
    );
  });

  it("roleId whole_file 이면 거절한다", () => {
    const bad = {
      ...validJson,
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [{ roleId: "whole_file", roleLabel: "X", startLine: 1, endLine: 2 }],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [{ roleId: "whole_file", roleLabel: "X", startLine: 1, endLine: 2 }],
        },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, codeById, "ko")).toThrow(
      "cohort_bundle_regions_reserved_role",
    );
  });

  it("빈 regions면 lenient가 entire_code 한 구역으로 채워 통과한다(짧은 코드)", () => {
    const bad = {
      ...validJson,
      submissions: [
        { submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", regions: [] },
        { submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", regions: [] },
      ],
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(bad), ids, codeById, "ko");
    expect(out.artifacts.submissions[0].regions[0].roleId).toBe("entire_code");
    expect(out.artifacts.submissions[1].regions[0].roleId).toBe("entire_code");
  });

  it("12줄 이상인데 빈 regions(entire_code 폴백)이면 거절한다", () => {
    const code12 = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join("\n");
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code12],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code12],
    ]);
    const bad = {
      ...validJson,
      submissions: [
        { submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", regions: [] },
        { submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", regions: [] },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, map, "ko")).toThrow(
      "cohort_bundle_regions_semantic_required",
    );
  });

  it("12줄 이상에서 entire_code 식별자를 쓰면 거절한다", () => {
    const code12 = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join("\n");
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code12],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code12],
    ]);
    const bad = {
      ...validJson,
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [{ roleId: "entire_code", roleLabel: "코드 전체", startLine: 1, endLine: 12 }],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [{ roleId: "entire_code", roleLabel: "코드 전체", startLine: 1, endLine: 12 }],
        },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, map, "ko")).toThrow(
      "cohort_bundle_regions_semantic_required",
    );
  });

  it("12줄 이상에서 구역이 1개만 있으면 거절한다", () => {
    const code12 = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join("\n");
    const map = new Map<string, string>([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code12],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code12],
    ]);
    const bad = {
      ...validJson,
      submissions: [
        {
          submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          regions: [{ roleId: "mono", roleLabel: "한 덩어리", startLine: 1, endLine: 12 }],
        },
        {
          submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          regions: [{ roleId: "mono", roleLabel: "한 덩어리", startLine: 1, endLine: 12 }],
        },
      ],
    };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(bad), ids, map, "ko")).toThrow(
      "cohort_bundle_regions_semantic_required",
    );
  });

});

describe("cohortSubmissionLinesFromSource", () => {
  it("빈 줄은 \"\" 요소로 유지하고 join으로 원문이 복원된다", () => {
    const s = "a\n\nb\n";
    const lines = cohortSubmissionLinesFromSource(s);
    expect(lines).toEqual(["a", "", "b", ""]);
    expect(lines.join("\n")).toBe(s);
  });

  it("연속 빈 줄마다 별도 \"\" 요소가 된다", () => {
    expect(cohortSubmissionLinesFromSource("a\n\n\nb")).toEqual(["a", "", "", "b"]);
  });
});

describe("parseRegionsLenient", () => {
  it("regions가 없으면 코드 전체 구역 한 개를 둔다", () => {
    expect(parseRegionsLenient(null, "a\nb", "ko")).toEqual([
      { roleId: "entire_code", roleLabel: "코드 전체", startLine: 1, endLine: 2 },
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

  it("strips 제출 요약 section before chip normalization", () => {
    const md =
      "## 도입\n\n본문\n\n## 제출 요약\n\n- (JS) foo\n\n## 알고리즘 비교\n\n[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] 내용";
    const out = sanitizeCohortReportMarkdown(md, ids);
    expect(out).not.toContain("제출 요약");
    expect(out).toContain("## 알고리즘 비교");
    expect(out).toContain("[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]");
  });

  it("strips Submission summary section (English heading)", () => {
    const md = "## Intro\n\nText\n\n## Submission summary\n\n- item\n\n## Compare\n\nMore.";
    const out = sanitizeCohortReportMarkdown(md, ids);
    expect(out).not.toMatch(/submission\s+summary/i);
    expect(out).toContain("## Compare");
  });

  it("strips single-line boilerplate ## headings (e.g. 제출 간 비교 개요)", () => {
    const md = "# T\n\n## 제출 간 비교 개요\n\n- [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]: JavaScript\n\n## 코드 비교\n\nx";
    const out = sanitizeCohortReportMarkdown(md, ids);
    expect(out).not.toContain("제출 간 비교 개요");
    expect(out).toContain("## 코드 비교");
  });

  it("removes <br /> after [[SUBMISSION]] so text follows on the same flow", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const md = `[[SUBMISSION:${id}]]<br /><br />의 설명`;
    const out = sanitizeCohortReportMarkdown(md, [id]);
    expect(out).toContain(`[[SUBMISSION:${id}]]의`);
    expect(out).not.toMatch(/\]\][\s]*<br/i);
  });

  it("joins [[SUBMISSION]] to following Hangul and strips 다음과 같습니다 filler lines", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const md = `[[SUBMISSION:${id}]]\n\n의 설명\n\n다음과 같습니다:\n\n코드 발췌는 다음과 같습니다.\n\n그냥 이 부분은 다음과 같습니다.\n\n\`\`\`js\nx\n\`\`\``;
    const out = sanitizeCohortReportMarkdown(md, [id]);
    expect(out).toContain(`[[SUBMISSION:${id}]]의`);
    expect(out).not.toMatch(/\]\]\s+\n/);
    expect(out).not.toContain("다음과 같습니다");
    expect(out).not.toContain("이 부분은 다음과 같");
    expect(out).not.toContain("코드 발췌는");
  });
});
