// 집단 비교 리포트 마크다운을 제출 칩 플레이스홀더와 함께 렌더링합니다.
"use client";

import Link from "next/link";
import { MarkdownPreview } from "../MarkdownPreview";
import { UserAvatar } from "../UserAvatar";
import styles from "./CohortReportBody.module.css";

const SUBMISSION_TOKEN = /\[\[SUBMISSION:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]\]/gi;

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
    m.set(r.submissionId, r);
  }
  return m;
}

export function CohortReportBody({ reportMarkdown, groupId, assignmentId, included }: Props) {
  const meta = metaById(included);
  const parts: Array<{ kind: "md"; text: string } | { kind: "chip"; id: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(SUBMISSION_TOKEN.source, SUBMISSION_TOKEN.flags);
  while ((m = re.exec(reportMarkdown)) !== null) {
    if (m.index > last) {
      parts.push({ kind: "md", text: reportMarkdown.slice(last, m.index) });
    }
    parts.push({ kind: "chip", id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < reportMarkdown.length) {
    parts.push({ kind: "md", text: reportMarkdown.slice(last) });
  }

  return (
    <div className={styles.wrap}>
      {parts.map((p, i) => {
        if (p.kind === "md") {
          return (
            <div key={`md-${i}`} className={styles.mdBlock}>
              <MarkdownPreview content={p.text} />
            </div>
          );
        }
        const row = meta.get(p.id);
        const href = `/groups/${groupId}/assignments/${assignmentId}/submissions/${p.id}`;
        const label = row !== undefined ? `${row.title} · v${row.versionNo}` : p.id;
        const nick = row?.authorNickname ?? "?";
        return (
          <Link key={`chip-${i}-${p.id}`} href={href} className={styles.chip}>
            <UserAvatar nickname={nick} imageUrl={row?.authorProfileImageUrl} size={18} className={styles.chipAvatar} />
            <span className={styles.chipLabel}>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
