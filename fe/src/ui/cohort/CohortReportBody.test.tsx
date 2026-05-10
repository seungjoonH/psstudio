// 집단 리포트에서 HTML 표·칩 불릿 라인을 칩 분할 전에 보호하는 로직을 검증합니다.
import { describe, expect, it } from "vitest";
import {
  extractChipBulletBlocks,
  extractHtmlTablesForChipSplit,
  restoreHtmlTables,
} from "./CohortReportBody";

describe("extractHtmlTablesForChipSplit", () => {
  it("표 안의 제출 칩이 문자열을 찢지 않도록 플레이스홀더로 치환한다", () => {
    const md = `앞\n\n<table><tr><th>[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]</th></tr></table>\n\n뒤`;
    const { text, tables } = extractHtmlTablesForChipSplit(md);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toContain("[[SUBMISSION:");
    expect(text).not.toContain("<table");
    expect(text).toContain("PSSTUDIO_COHORT_TABLE_0");
    expect(restoreHtmlTables(text, tables)).toContain("<table");
  });
});

describe("extractChipBulletBlocks", () => {
  it("연속된 `- [[SUBMISSION:…]]` 라인을 한 묶음 placeholder로 빼낸다", () => {
    const md = [
      "본문 도입",
      "",
      "- [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
      "- [[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]] 짧은 부연",
      "",
      "다른 본문",
    ].join("\n");
    const { text, blocks } = extractChipBulletBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      ordered: false,
      items: [
        { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", trailing: "" },
        { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", trailing: "짧은 부연" },
      ],
    });
    expect(text).toContain("PSSTUDIO_COHORT_BULLETS_0");
    expect(text).not.toMatch(/-\s+\[\[SUBMISSION:/);
  });

  it("칩이 없는 일반 list 라인은 보호하지 않는다", () => {
    const md = ["- 그냥 항목", "- 또 다른 항목"].join("\n");
    const { text, blocks } = extractChipBulletBlocks(md);
    expect(blocks).toHaveLength(0);
    expect(text).toBe(md);
  });
});
