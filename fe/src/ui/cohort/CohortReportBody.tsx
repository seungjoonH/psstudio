// 집단 비교 리포트 마크다운을 제출 칩 플레이스홀더와 함께 렌더링합니다.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buildCls } from "../../lib/buildCls";
import { MarkdownPreview } from "../MarkdownPreview";
import { UserAvatar } from "../UserAvatar";
import styles from "./CohortReportBody.module.css";

const SUBMISSION_UUID_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

const SUBMISSION_TOKEN = new RegExp(`\\[\\[SUBMISSION:(${SUBMISSION_UUID_PATTERN})\\]\\]`, "gi");

/** LLM이 넣은 `<table>` 안 `<th>`에 `[[SUBMISSION:…]]`가 있으면 칩 분할이 테이블 문자열을 잘라, `<table`이 없는 조각은 인라인 마크다운이 되어 rehype-raw가 꺼지고 태그가 글자로 보인다. 분할 전에 표 통째를 플레이스홀더로 빼서 방지한다. */
const COHORT_TABLE_MARKER = /<!--\s*PSSTUDIO_COHORT_TABLE_(\d+)\s*-->/;

/** `- [[SUBMISSION:…]] 짧은 부연` 같은 list-item 라인은 분할 단계에서 빈 li와 chip이 갈라지지 않도록 통째로 placeholder로 보호한다. */
const COHORT_BULLETS_MARKER = /<!--\s*PSSTUDIO_COHORT_BULLETS_(\d+)\s*-->/;
const BULLET_CHIP_LINE = new RegExp(
  `^(\\s*)([-*+])\\s+\\[\\[SUBMISSION:(${SUBMISSION_UUID_PATTERN})\\]\\](?:\\s+(.*))?$`,
  "i",
);
const ORDERED_CHIP_LINE = new RegExp(
  `^(\\s*)\\d+\\.\\s+\\[\\[SUBMISSION:(${SUBMISSION_UUID_PATTERN})\\]\\](?:\\s+(.*))?$`,
  "i",
);

export type CohortChipBulletItem = { uuid: string; trailing: string };
export type CohortChipBulletBlock = { ordered: boolean; items: CohortChipBulletItem[] };

/** 연속된 chip-only list-item 라인을 모아 placeholder로 빼낸다. 다른 list 라인이 섞이면 그 묶음에서 끊는다. */
export function extractChipBulletBlocks(
  markdown: string,
): { text: string; blocks: CohortChipBulletBlock[] } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: CohortChipBulletBlock[] = [];
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const u = BULLET_CHIP_LINE.exec(lines[i]);
    const o = ORDERED_CHIP_LINE.exec(lines[i]);
    if (u !== null || o !== null) {
      const ordered = o !== null && u === null;
      const items: CohortChipBulletItem[] = [];
      while (i < lines.length) {
        const lu = BULLET_CHIP_LINE.exec(lines[i]);
        const lo = ORDERED_CHIP_LINE.exec(lines[i]);
        const matchedOrdered = lo !== null && lu === null;
        const m = ordered ? lo : lu;
        if (m === null) break;
        if (matchedOrdered !== ordered) break;
        const uuid = m[3].toLowerCase();
        const trailing = (m[4] ?? "").trim();
        items.push({ uuid, trailing });
        i += 1;
      }
      const idx = blocks.length;
      blocks.push({ ordered, items });
      out.push("");
      out.push(`<!-- PSSTUDIO_COHORT_BULLETS_${idx} -->`);
      out.push("");
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return { text: out.join("\n"), blocks };
}

/** 집단 리포트 마크다운에서 원시 HTML `<table>…</table>`만 칩 분할에서 보호합니다. */
export function extractHtmlTablesForChipSplit(markdown: string): { text: string; tables: string[] } {
  const tables: string[] = [];
  const text = markdown.replace(/<table\b[\s\S]*?<\/table>/gi, (full) => {
    const idx = tables.length;
    tables.push(full);
    return `\n\n<!-- PSSTUDIO_COHORT_TABLE_${idx} -->\n\n`;
  });
  return { text, tables };
}

export function restoreHtmlTables(segment: string, tables: readonly string[]): string {
  return segment.replace(/<!--\s*PSSTUDIO_COHORT_TABLE_(\d+)\s*-->/g, (_, g) => {
    const i = Number(g);
    return tables[i] ?? "";
  });
}

export type CohortIncludedLite = {
  submissionId: string;
  versionNo: number;
  authorNickname: string;
  title: string;
  authorProfileImageUrl: string;
};

type Props = {
  reportMarkdown: string;
  groupId: string;
  assignmentId: string;
  included: CohortIncludedLite[];
  /** false면 제출 칩은 링크가 아니며(랜딩 목업 등), 호버·눌림 피드백만 동일하게 둡니다. */
  submissionLinks?: boolean;
  /** false면 칩에서 `v{version}`을 숨깁니다(제목에 # 등으로 이미 표기할 때). */
  showSubmissionVersionOnChips?: boolean;
};

function metaById(rows: CohortIncludedLite[]): Map<string, CohortIncludedLite> {
  const m = new Map<string, CohortIncludedLite>();
  for (const r of rows) {
    m.set(r.submissionId.toLowerCase(), r);
  }
  return m;
}

/** 목록·제목·펜스 등 블록 전용 마크다운 — 칩과 같은 플렉스 줄에 두지 않는다. */
function isInlineOnlyMd(text: string): boolean {
  if (text.includes("```")) return false;
  if (COHORT_TABLE_MARKER.test(text)) return false;
  if (COHORT_BULLETS_MARKER.test(text)) return false;
  // 원시 HTML 블록(집단 리포트 표 등)은 블록 마크다운으로 렌더해야 칩·인라인과 섞이지 않는다.
  if (/<\s*table\b/i.test(text)) return false;
  const normalized = text.replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();
  if (trimmed.length === 0) return true;
  // 앞뒤 공백만 다듬은 뒤에도 빈 줄이 있으면 문단 구분 → 블록(칩만 한 줄·본문 다음 줄로 갈라짐)
  if (/\n\s*\n/.test(trimmed)) return false;
  const nonemptyLines = normalized.split("\n").filter((l) => l.trim().length > 0);
  for (const line of nonemptyLines) {
    const s = line.trimStart();
    if (/^#{1,6}\s/.test(s)) return false;
    if (/^\s*[-*+]\s/.test(s)) return false;
    if (/^\s*\d+\.\s/.test(s)) return false;
  }
  return true;
}

/** 블록 마크다운 앞의 인라인 머리말을 잘라 같은 <p>에 유지합니다(예: 칩 뒤 설명 + 다음 줄 코드펜스). */
function splitLeadingInlinePrefix(text: string): { inlinePrefix: string; blockRemainder: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  const candidates = [
    normalized.search(/\n\s*\n/),
    normalized.search(/\n\s*```/),
    normalized.search(/\n\s*#{1,6}\s/),
    normalized.search(/\n\s*[-*+]\s/),
    normalized.search(/\n\s*\d+\.\s/),
    normalized.search(/\n\s*<\s*table\b/i),
    normalized.search(/\n\s*<!--\s*PSSTUDIO_COHORT_TABLE_\d+\s*-->/),
    normalized.search(/\n\s*<!--\s*PSSTUDIO_COHORT_BULLETS_\d+\s*-->/),
  ].filter((idx) => idx >= 0);
  if (candidates.length === 0) {
    return { inlinePrefix: normalized, blockRemainder: "" };
  }
  const cut = Math.min(...candidates);
  if (cut <= 0) {
    return { inlinePrefix: "", blockRemainder: normalized };
  }
  return {
    inlinePrefix: normalized.slice(0, cut),
    blockRemainder: normalized.slice(cut),
  };
}

type Part = { kind: "md"; text: string } | { kind: "chip"; id: string };
export function CohortReportBody({
  reportMarkdown,
  groupId,
  assignmentId,
  included,
  submissionLinks = true,
  showSubmissionVersionOnChips = true,
}: Props) {
  const meta = metaById(included);
  const tableExtracted = extractHtmlTablesForChipSplit(reportMarkdown);
  const bulletExtracted = extractChipBulletBlocks(tableExtracted.text);
  const md = bulletExtracted.text;
  const extractedTables = tableExtracted.tables;
  const extractedBullets = bulletExtracted.blocks;
  const parts: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(SUBMISSION_TOKEN.source, SUBMISSION_TOKEN.flags);
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) {
      parts.push({ kind: "md", text: md.slice(last, m.index) });
    }
    parts.push({ kind: "chip", id: m[1].toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < md.length) {
    parts.push({ kind: "md", text: md.slice(last) });
  }

  const blocks: ReactNode[] = [];
  let inlineQueue: Part[] = [];
  let blockKey = 0;

  function renderChip(p: { kind: "chip"; id: string }, key: string) {
    const row = meta.get(p.id);
    const canonicalId = row?.submissionId ?? p.id;
    const href = `/groups/${groupId}/assignments/${assignmentId}/submissions/${canonicalId}`;
    const nick = row?.authorNickname ?? "?";
    const inner = (
      <>
        <UserAvatar nickname={nick} imageUrl={row?.authorProfileImageUrl} size={18} className={styles.chipAvatar} />
        <span className={styles.chipLabel}>
          {row !== undefined ? (
            <>
              <span className={styles.chipTitle}>{row.title}</span>
              {showSubmissionVersionOnChips ? (
                <span className={styles.chipVer}>v{row.versionNo}</span>
              ) : null}
            </>
          ) : (
            canonicalId
          )}
        </span>
      </>
    );
    if (!submissionLinks) {
      return (
        <span key={key} className={buildCls(styles.chip, styles.chipStatic)}>
          {inner}
        </span>
      );
    }
    return (
      <Link key={key} href={href} className={styles.chip}>
        {inner}
      </Link>
    );
  }

  function flushInline() {
    if (inlineQueue.length === 0) return;
    const nodes: ReactNode[] = [];
    inlineQueue.forEach((p, j) => {
      if (p.kind === "md") {
        if (p.text.trim().length === 0) return;
        nodes.push(
          <span className={styles.inlineMdWrap} key={`im-${j}`}>
            <MarkdownPreview content={restoreHtmlTables(p.text, extractedTables)} inline />
          </span>,
        );
        return;
      }
      nodes.push(renderChip(p, `ic-${blockKey}-${j}`));
    });
    inlineQueue = [];
    if (nodes.length === 0) return;
    blocks.push(
      <p className={styles.chipInlineParagraph} key={`row-${blockKey++}`}>
        {nodes}
      </p>,
    );
  }

  function emitMdBlock(text: string) {
    if (text.trim().length === 0) return;
    blocks.push(
      <div key={`blk-${blockKey++}`} className={styles.mdBlock}>
        <MarkdownPreview content={restoreHtmlTables(text, extractedTables)} />
      </div>,
    );
  }

  function emitChipBulletBlock(block: CohortChipBulletBlock) {
    const ListTag = block.ordered ? "ol" : "ul";
    blocks.push(
      <ListTag key={`bullets-${blockKey++}`} className={styles.chipList}>
        {block.items.map((it, j) => (
          <li key={`${it.uuid}:${j}`} className={styles.chipListItem}>
            {renderChip({ kind: "chip", id: it.uuid }, `cl-${blockKey}-${j}`)}
            {it.trailing.length > 0 ? (
              <span className={styles.chipListTrailing}>
                <MarkdownPreview content={it.trailing} inline />
              </span>
            ) : null}
          </li>
        ))}
      </ListTag>,
    );
  }

  /** mdBlock으로 보낼 텍스트에 chip-bullet placeholder가 있으면 그 자리만 chip-list로 직접 렌더한다. */
  function emitBlockMaybeChipList(text: string) {
    const re = /<!--\s*PSSTUDIO_COHORT_BULLETS_(\d+)\s*-->/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match.index > cursor) {
        emitMdBlock(text.slice(cursor, match.index));
      }
      const idx = Number(match[1]);
      const block = extractedBullets[idx];
      if (block !== undefined) {
        emitChipBulletBlock(block);
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) {
      emitMdBlock(text.slice(cursor));
    }
  }

  for (const p of parts) {
    if (p.kind === "md" && !isInlineOnlyMd(p.text)) {
      const { inlinePrefix, blockRemainder } = splitLeadingInlinePrefix(p.text);
      if (inlinePrefix.trim().length > 0) {
        inlineQueue.push({ kind: "md", text: inlinePrefix });
      }
      flushInline();
      emitBlockMaybeChipList(blockRemainder);
    } else {
      inlineQueue.push(p);
    }
  }
  flushInline();

  return <div className={styles.wrap}>{blocks}</div>;
}
