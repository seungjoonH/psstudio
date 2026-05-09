// 집단 비교 리포트 마크다운을 제출 칩 플레이스홀더와 함께 렌더링합니다.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownPreview } from "../MarkdownPreview";
import { UserAvatar } from "../UserAvatar";
import { prepareCohortReportMarkdownForDisplay } from "../../lib/cohortReportMarkdown";
import styles from "./CohortReportBody.module.css";

const SUBMISSION_TOKEN =
  /\[\[SUBMISSION:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\]\]/gi;

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

type Part = { kind: "md"; text: string } | { kind: "chip"; id: string };

export function CohortReportBody({ reportMarkdown, groupId, assignmentId, included }: Props) {
  const meta = metaById(included);
  const md = prepareCohortReportMarkdownForDisplay(reportMarkdown);
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
    return (
      <Link key={key} href={href} className={styles.chip}>
        <UserAvatar nickname={nick} imageUrl={row?.authorProfileImageUrl} size={18} className={styles.chipAvatar} />
        <span className={styles.chipLabel}>
          {row !== undefined ? (
            <>
              <span className={styles.chipTitle}>{row.title}</span>
              <span className={styles.chipVer}>v{row.versionNo}</span>
            </>
          ) : (
            canonicalId
          )}
        </span>
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
            <MarkdownPreview content={p.text} inline />
          </span>,
        );
        return;
      }
      nodes.push(renderChip(p, `ic-${blockKey}-${j}`));
    });
    inlineQueue = [];
    if (nodes.length === 0) return;
    blocks.push(
      <span className={styles.inlineFlow} key={`row-${blockKey++}`}>
        {nodes}
      </span>,
    );
  }

  for (const p of parts) {
    if (p.kind === "md" && !isInlineOnlyMd(p.text)) {
      flushInline();
      blocks.push(
        <div key={`blk-${blockKey++}`} className={styles.mdBlock}>
          <MarkdownPreview content={p.text} />
        </div>,
      );
    } else {
      inlineQueue.push(p);
    }
  }
  flushInline();

  return <div className={styles.wrap}>{blocks}</div>;
}
