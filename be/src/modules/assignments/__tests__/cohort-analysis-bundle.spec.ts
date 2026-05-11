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

  it("submissions가 배열을 JSON 문자열로 이중 인코딩해도 처리한다", () => {
    const json = {
      reportMarkdown: validJson.reportMarkdown,
      submissions: JSON.stringify(validJson.submissions),
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.artifacts.submissions).toHaveLength(2);
  });

  it("response 래퍼 안에 번들이 있으면 처리한다", () => {
    const json = { response: validJson };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.reportMarkdown).toContain("Hello");
    expect(out.artifacts.submissions).toHaveLength(2);
  });

  it("submissions를 UUID 키 객체로 줘도 배열과 동일하게 처리한다", () => {
    const json = {
      reportMarkdown: validJson.reportMarkdown,
      submissions: {
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": {
          regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
        },
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": {
          regions: [{ roleId: "main", roleLabel: "Main", startLine: 1, endLine: 2 }],
        },
      },
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.artifacts.submissions).toHaveLength(2);
  });

  it("submissions가 배열도 객체 맵도 아니면 거절한다", () => {
    const json = { reportMarkdown: "x", submissions: "nope" };
    expect(() => parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko")).toThrow(
      "cohort_bundle_submissions_not_array",
    );
  });

  it("keeps report markdown unchanged even with bare uuid text", () => {
    const json = {
      ...validJson,
      reportMarkdown:
        "Submission aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa 와 bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb 비교",
    };
    const out = parseAndValidateCohortBundle(JSON.stringify(json), ids, codeById, "ko");
    expect(out.reportMarkdown).toBe(json.reportMarkdown);
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

  it("제출마다 roleId·roleLabel이 독립적으로 보존된다(첫 제출로 덮어쓰지 않는다)", () => {
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
    expect(b?.regions[0]?.roleId).toBe("beta");
    expect(b?.regions[0]?.roleLabel).toBe("베타");
  });

  it("같은 roleId 집합이어도 제출별로 라벨·앵커 범위를 덮어쓰지 않고 시작 줄 기준으로만 정렬한다", () => {
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
    expect(b?.regions[0]?.roleId).toBe("main_loop");
    expect(b?.regions[0]?.roleLabel).toBe("루프");
    expect(b?.regions[0]?.startLine).toBe(5);
    expect(b?.regions[0]?.endLine).toBe(15);
    expect(b?.regions[1]?.roleId).toBe("weekday_filter");
    expect(b?.regions[1]?.roleLabel).toBe("필터");
    expect(b?.regions[1]?.startLine).toBe(17);
    expect(b?.regions[1]?.endLine).toBe(22);
  });

  it("제출 간 구역 개수·roleId 집합이 달라도 검증을 통과한다", () => {
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
    expect(out.artifacts.submissions[1].regions).toHaveLength(1);
    expect(out.artifacts.submissions[1].regions[0]?.roleId).toBe("c");
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

  it("startAnchorText/endAnchorText로 줄 범위를 계산한다", () => {
    const code = ["line1", "for (int i = 0; i < n; i++) {", "sum += a[i];", "}", "return sum;"].join("\n");
    const out = parseRegionsLenient(
      [
        {
          roleId: "core_loop",
          roleLabel: "핵심 반복",
          startAnchorText: "for (int i = 0; i < n; i++) {",
          endAnchorText: "}",
        },
      ],
      code,
      "ko",
    );
    expect(out[0]).toEqual({
      roleId: "core_loop",
      roleLabel: "핵심 반복",
      startLine: 2,
      endLine: 4,
    });
  });

  it("앵커를 원문에서 찾지 못하면 실패한다", () => {
    expect(() =>
      parseRegionsLenient(
        [
          {
            roleId: "core_loop",
            roleLabel: "핵심 반복",
            startAnchorText: "NOT_FOUND_START",
            endAnchorText: "NOT_FOUND_END",
          },
        ],
        "a\nb\nc",
        "ko",
      ),
    ).toThrow("cohort_bundle_anchor_not_found");
  });
});

describe("sanitizeCohortReportMarkdown", () => {
  const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];

  it("keeps LLM markdown as-is without post-processing", () => {
    const md =
      "## 제출 요약\n\nsee submission(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)\n\n[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]<br /><br />의 설명\n\n다음과 같이 구현되어 있습니다:\n```cpp\nint h = t / 100;\n```";
    const out = sanitizeCohortReportMarkdown(md, ids);
    expect(out).toBe(md);
  });
});
