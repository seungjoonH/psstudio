// 집단 비교 리포트 마크다운을 제출 칩 플레이스홀더와 함께 렌더링합니다.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownPreview } from "../MarkdownPreview";
import { UserAvatar } from "../UserAvatar";
import styles from "./CohortReportBody.module.css";

const SUBMISSION_TOKEN =
  /\[\[SUBMISSION:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\]\]/gi;

/** `]]` 직후 줄바꿈이 있으면 칩만 한 블록·본문은 다음 블록으로 갈라져 한 줄을 다 쓴 것처럼 보이므로 붙인다. */
function collapseNewlinesAfterSubmissionChips(markdown: string): string {
  return markdown.replace(
    /(\[\[SUBMISSION:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\]\])\s*\n+/gi,
    "$1",
  );
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
};

function metaById(rows: CohortIncludedLite[]): Map<string, CohortIncludedLite> {
  const m = new Map<string, CohortIncludedLite>();
  for (const r of rows) {
    m.set(r.submissionId.toLowerCase(), r);
  }
  return m;
}

/** 목록·제목·펜스·다중 줄 등 블록 전용 마크다운 — 칩과 한 줄에 섞지 않는다. */
function isInlineOnlyMd(text: string): boolean {
  if (text.includes("```")) return false;
  const nonemptyLines = text.split("\n").filter((l) => l.trim().length > 0);
  if (nonemptyLines.length > 1) return false;
  const t = text.trimStart();
  if (/^#{1,6}\s/.test(t)) return false;
  if (/^\s*[-*+]\s/.test(t)) return false;
  if (/^\s*\d+\.\s/.test(t)) return false;
  return true;
}

type Part = { kind: "md"; text: string } | { kind: "chip"; id: string };

export function CohortReportBody({ reportMarkdown, groupId, assignmentId, included }: Props) {
  const meta = metaById(included);
  const md = collapseNewlinesAfterSubmissionChips(reportMarkdown);
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
          <div className={styles.inlineMdWrap} key={`im-${j}`}>
            <MarkdownPreview content={p.text} inline />
          </div>,
        );
        return;
      }
      nodes.push(renderChip(p, `ic-${blockKey}-${j}`));
    });
    inlineQueue = [];
    if (nodes.length === 0) return;
    blocks.push(
      <div className={styles.inlineRow} key={`row-${blockKey++}`}>
        {nodes}
      </div>,
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
