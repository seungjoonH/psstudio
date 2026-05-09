// 집단 비교용 정규화 코드 열(역할 색·가로 스크롤·더미 패딩)을 렌더링합니다.
"use client";

import { useCallback, useRef } from "react";
import type { CohortSubmissionArtifact } from "../../assignments/server";
import styles from "./CohortCodeColumns.module.css";

function roleColorIndex(roleId: string): number {
  let h = 0;
  for (let i = 0; i < roleId.length; i += 1) {
    h = (h * 31 + roleId.charCodeAt(i)) >>> 0;
  }
  return h % 12;
}

function regionAtLine(
  regions: CohortSubmissionArtifact["regions"],
  lineNo: number,
): CohortSubmissionArtifact["regions"][0] | null {
  for (const r of regions) {
    if (lineNo >= r.startLine && lineNo <= r.endLine) {
      return r;
    }
  }
  return null;
}

type ColumnProps = {
  artifact: CohortSubmissionArtifact;
  title: string;
  versionNo: number;
};

const BAND_CLASSES = [
  styles.band0,
  styles.band1,
  styles.band2,
  styles.band3,
  styles.band4,
  styles.band5,
  styles.band6,
  styles.band7,
  styles.band8,
  styles.band9,
  styles.band10,
  styles.band11,
];

function CodeColumn({ artifact, title, versionNo }: ColumnProps) {
  const lines = artifact.normalizedCode.length === 0 ? [""] : artifact.normalizedCode.split("\n");
  return (
    <div className={styles.column}>
      <div className={styles.columnHead}>
        <span className={styles.columnTitle}>{title}</span>
        <span className={styles.columnVer}>v{versionNo}</span>
      </div>
      <pre className={styles.pre}>
        {lines.map((line, idx) => {
          const lineNo = idx + 1;
          const reg = regionAtLine(artifact.regions, lineNo);
          const ri = reg !== null ? roleColorIndex(reg.roleId) : null;
          const showLabel = reg !== null && lineNo === reg.startLine;
          const bandClass = ri !== null ? BAND_CLASSES[ri] ?? styles.bandNone : styles.bandNone;
          return (
            <div key={lineNo} className={styles.lineRow}>
              <span className={styles.gutter}>{lineNo}</span>
              <div className={styles.lineBody}>
                {showLabel ? (
                  <div className={styles.roleTag} data-band={ri}>
                    {reg.roleLabel}
                  </div>
                ) : null}
                <div className={bandClass}>
                  <code className={styles.code}>{line.length > 0 ? line : " "}</code>
                </div>
              </div>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

type Props = {
  submissions: CohortSubmissionArtifact[];
  titlesBySubmissionId: Map<string, { title: string; versionNo: number }>;
};

export function CohortCodeColumns({ submissions, titlesBySubmissionId }: Props) {
  const colRefs = useRef<Array<HTMLDivElement | null>>([]);

  const scrollToColumn = useCallback((index: number) => {
    const el = colRefs.current[index];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.jumpRow}>
        {submissions.map((s, i) => {
          const t = titlesBySubmissionId.get(s.submissionId);
          const label = t !== undefined ? `${t.title} · v${t.versionNo}` : s.submissionId.slice(0, 8);
          return (
            <button
              key={s.submissionId}
              type="button"
              className={styles.jumpBtn}
              onClick={() => scrollToColumn(i)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className={styles.scrollOuter}>
        <div className={styles.scrollInner}>
          <div className={styles.dummy} aria-hidden />
          {submissions.map((s, i) => {
            const t = titlesBySubmissionId.get(s.submissionId);
            return (
              <div
                key={s.submissionId}
                className={styles.columnWrap}
                ref={(el) => {
                  colRefs.current[i] = el;
                }}
              >
                <CodeColumn
                  artifact={s}
                  title={t?.title ?? "—"}
                  versionNo={t?.versionNo ?? 1}
                />
              </div>
            );
          })}
          <div className={styles.dummy} aria-hidden />
        </div>
      </div>
    </div>
  );
}
