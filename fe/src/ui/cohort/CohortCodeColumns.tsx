// 집단 비교용 제출 원문 코드 열(역할 색·가로 스크롤·더미 패딩)을 렌더링합니다.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import type { CohortSubmissionArtifact } from "../../assignments/server";
import { buildCls } from "../../lib/buildCls";
import { resolveShikiLanguage } from "../../lib/shikiLanguage";
import styles from "./CohortCodeColumns.module.css";

/** 줄에 걸친 모든 region을 반환합니다. */
function regionsAtLine(
  regions: CohortSubmissionArtifact["regions"],
  lineNo: number,
): CohortSubmissionArtifact["regions"] {
  return regions.filter((r) => lineNo >= r.startLine && lineNo <= r.endLine);
}

function selectDisplayRegion(
  overlaps: CohortSubmissionArtifact["regions"],
  hoveredRoleId: string | null,
): CohortSubmissionArtifact["regions"][number] | null {
  if (overlaps.length === 0) return null;
  if (hoveredRoleId !== null) {
    const hovered = overlaps.find((r) => r.roleId === hoveredRoleId);
    if (hovered !== undefined) return hovered;
  }
  return [...overlaps].sort((a, b) => {
    const spanA = a.endLine - a.startLine + 1;
    const spanB = b.endLine - b.startLine + 1;
    if (spanA !== spanB) return spanA - spanB;
    return a.startLine - b.startLine;
  })[0]!;
}

/** 제출마다 구역의 위·아래 순서가 달라도 같은 roleId는 항상 같은 색(패널 간 정렬). 해시 충돌도 없음. */
function stableBandIndexForRoleId(
  regions: CohortSubmissionArtifact["regions"],
  roleId: string,
): number {
  const ids = [...new Set(regions.map((r) => r.roleId))].sort((a, b) => a.localeCompare(b));
  const idx = ids.indexOf(roleId);
  return idx >= 0 ? idx : 0;
}

type ColumnProps = {
  artifact: CohortSubmissionArtifact;
  title: string;
  versionNo: number;
  /** false면 랜딩 등에서 제목에 이미 버전·#이 있을 때 v표기를 숨깁니다. */
  showVersion?: boolean;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** shiki 전체 HTML에서 `<code>` 안쪽 토큰 HTML만 뽑습니다(DiffViewer와 동일). */
function extractInlineCodeHtml(html: string, emptyLine: boolean): string {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (match === null) return emptyLine ? "&nbsp;" : "";
  return emptyLine ? "&nbsp;" : match[1];
}

function lineHighlightKey(line: string): string {
  return line.length > 0 ? line : " ";
}

function CodeColumn({ artifact, title, versionNo, showVersion = true }: ColumnProps) {
  const lines = useMemo(
    () => (artifact.code.length === 0 ? [""] : artifact.code.split("\n")),
    [artifact.code],
  );
  const [theme, setTheme] = useState<"github-light" | "github-dark">("github-light");
  const [highlightMap, setHighlightMap] = useState<Record<string, string>>({});
  const [hoveredRoleId, setHoveredRoleId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.dataset.theme === "dark" ? "github-dark" : "github-light");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const lang = resolveShikiLanguage(artifact.language);
    const keys = Array.from(new Set(lines.map((line) => lineHighlightKey(line))));
    if (keys.length === 0) {
      setHighlightMap({});
      return;
    }
    Promise.all(
      keys.map(async (key) => {
        const isEmptyDisplay = key === " ";
        const input = isEmptyDisplay ? " " : key;
        try {
          const html = await codeToHtml(input, { lang, theme });
          return [key, extractInlineCodeHtml(html, isEmptyDisplay)] as const;
        } catch {
          try {
            const html = await codeToHtml(input, { lang: "txt", theme });
            return [key, extractInlineCodeHtml(html, isEmptyDisplay)] as const;
          } catch {
            return [key, isEmptyDisplay ? "&nbsp;" : escapeHtml(key)] as const;
          }
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setHighlightMap(Object.fromEntries(entries));
      })
      .catch(() => {
        if (cancelled) return;
        setHighlightMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.language, lines, theme]);

  return (
    <div className={styles.column}>
      <div className={styles.columnHead}>
        <span className={styles.columnTitle}>{title}</span>
        {showVersion ? <span className={styles.columnVer}>v{versionNo}</span> : null}
      </div>
      <pre className={styles.pre} onMouseLeave={() => setHoveredRoleId(null)}>
        {lines.map((line, idx) => {
          const lineNo = idx + 1;
          const overlaps = regionsAtLine(artifact.regions, lineNo);
          const reg = selectDisplayRegion(overlaps, hoveredRoleId);
          const displayOverlaps = [...overlaps].sort((a, b) => {
            const spanA = a.endLine - a.startLine + 1;
            const spanB = b.endLine - b.startLine + 1;
            if (spanA !== spanB) return spanA - spanB;
            return a.startLine - b.startLine;
          });
          const ri =
            reg !== null ? stableBandIndexForRoleId(artifact.regions, reg.roleId) % BAND_CLASSES.length : null;
          const showLabel = reg !== null && lineNo === reg.endLine;
          const isHoveredRegionLine = reg !== null && hoveredRoleId !== null && reg.roleId === hoveredRoleId;
          const bandClass = ri !== null ? BAND_CLASSES[ri] ?? styles.bandNone : styles.bandNone;
          return (
            <div key={lineNo} className={styles.lineRow}>
              <span className={styles.gutter}>
                <span className={styles.gutterLineNo}>{lineNo}</span>
                {displayOverlaps.length > 0 ? (
                  <span className={styles.gutterLanes} aria-hidden>
                    {displayOverlaps.map((ov) => {
                      const laneBand =
                        stableBandIndexForRoleId(artifact.regions, ov.roleId) % BAND_CLASSES.length;
                      const isHoveredLane = hoveredRoleId !== null && hoveredRoleId === ov.roleId;
                      return (
                        <span
                          key={`${ov.roleId}:${ov.startLine}-${ov.endLine}`}
                          className={`${styles.gutterLane} ${isHoveredLane ? styles.gutterLaneHovered : ""}`}
                          data-band={laneBand}
                          onMouseEnter={() => setHoveredRoleId(ov.roleId)}
                        />
                      );
                    })}
                  </span>
                ) : null}
              </span>
              <div className={styles.lineBody}>
                <div
                  className={`${styles.lineBand} ${bandClass} ${isHoveredRegionLine ? styles.lineBandHovered : ""}`}
                  data-band={ri ?? -1}
                  onMouseEnter={() => setHoveredRoleId(reg?.roleId ?? null)}
                >
                  {showLabel ? (
                    <div
                      className={`${styles.roleTag} ${isHoveredRegionLine ? styles.roleTagHovered : ""}`}
                      data-band={ri}
                    >
                      {`${reg.roleLabel} (${reg.startLine}~${reg.endLine}줄)`}
                    </div>
                  ) : null}
                  <code className={styles.code}>
                    <span
                      className={styles.codeShiki}
                      dangerouslySetInnerHTML={{
                        __html:
                          highlightMap[lineHighlightKey(line)] ??
                          (line.length > 0 ? escapeHtml(line) : "&nbsp;"),
                      }}
                    />
                  </code>
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
  /** 랜딩: 카드 폭을 줄여 가로 캐러셀이 드러나게 합니다. */
  layout?: "landingPeek";
};

export function CohortCodeColumns({ submissions, titlesBySubmissionId, layout }: Props) {
  const showVersion = layout !== "landingPeek";
  const colRefs = useRef<Array<HTMLDivElement | null>>([]);

  const scrollToColumn = useCallback((index: number) => {
    const el = colRefs.current[index];
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  return (
    <div className={buildCls(styles.root, layout === "landingPeek" && styles.rootLandingPeek)}>
      <div className={styles.jumpRow}>
        {submissions.map((s, i) => {
          const t = titlesBySubmissionId.get(s.submissionId);
          return (
            <button
              key={s.submissionId}
              type="button"
              className={styles.jumpBtn}
              onClick={() => scrollToColumn(i)}
            >
              {t !== undefined ? (
                <span className={styles.jumpBtnInner}>
                  <span className={styles.jumpTitle}>{t.title}</span>
                  {showVersion ? <span className={styles.jumpVer}>v{t.versionNo}</span> : null}
                </span>
              ) : (
                s.submissionId.slice(0, 8)
              )}
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
                  showVersion={showVersion}
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
