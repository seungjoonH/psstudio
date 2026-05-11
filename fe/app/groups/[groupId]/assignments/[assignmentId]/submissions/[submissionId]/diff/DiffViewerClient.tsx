"use client";
// 제출 diff를 GitHub 스타일로 렌더링하는 컴포넌트입니다.
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { codeToHtml } from "shiki";
import { useI18n } from "../../../../../../../../src/i18n/I18nProvider";
import { computeJsTsBlockCommentLineMask } from "../../../../../../../../src/lib/jsBlockCommentLineMask";
import { resolveShikiLanguage } from "../../../../../../../../src/lib/shikiLanguage";
import type {
  ReactionTargetType,
  ReviewReplyDto,
  SubmissionReviewDto,
} from "../../../../../../../../src/submissions/server";
import { Button } from "../../../../../../../../src/ui/Button";
import { InlineAddButton } from "../../../../../../../../src/ui/InlineAddButton";
import { MarkdownPreview } from "../../../../../../../../src/ui/MarkdownPreview";
import { UserAvatar } from "../../../../../../../../src/ui/UserAvatar";
import { CommentCard } from "../../../../../../../../src/ui/comments/CommentCard";
import styles from "./DiffViewerClient.module.css";

type DiffRow = {
  key: string;
  kind: "add" | "remove" | "context" | "meta";
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

type ReviewSpanKind = "none" | "single" | "start" | "middle" | "end";

/** 서버 액션의 redirect()가 클라이언트에서 던지는 NEXT_REDIRECT 오류인지 구분합니다. */
function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** diff 코멘트 폼 제출 중 중복 클릭 방지(useFormStatus는 form 자손이어야 함). */
function DiffReviewSubmitButton({
  label,
  canSubmit,
}: {
  label: string;
  canSubmit: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={!canSubmit || pending} loading={pending}>
      {label}
    </Button>
  );
}

/** 범위 리뷰 스레드는 끝 줄 아래에 붙인다(단일 줄은 start===end). */
function reviewThreadAnchorLine(review: SubmissionReviewDto): number {
  return Math.max(review.startLine, review.endLine);
}

/** 리뷰 코멘트가 덮는 new 라인 구간에서 각 줄의 위치(시작/중간/끝)를 구합니다. */
function classifyReviewSpan(lineNo: number | null, covering: SubmissionReviewDto[]): ReviewSpanKind {
  if (lineNo === null || covering.length === 0) return "none";

  const multiLine = covering.filter((r) => r.endLine > r.startLine);
  const multiStartsHere = multiLine.some((r) => r.startLine === lineNo);
  const multiEndsHere = multiLine.some((r) => r.endLine === lineNo);
  const onlySingles =
    covering.length > 0 &&
    covering.every((r) => r.startLine === lineNo && r.endLine === lineNo);

  if (multiLine.length === 0 && onlySingles) return "single";

  if (multiStartsHere && !multiEndsHere) return "start";
  if (multiEndsHere && !multiStartsHere) return "end";
  return "middle";
}

type Props = {
  groupId: string;
  assignmentId: string;
  submissionId: string;
  versions: number[];
  fromVersion: number;
  toVersion: number;
  diffText: string;
  reviews: SubmissionReviewDto[];
  diffLanguage?: string | null;
  sameVersionCode?: string | null;
  sameVersionLanguage?: string | null;
  showRangeSelector?: boolean;
  collapseReviewsByDefault?: boolean;
  createReviewAction: (formData: FormData) => Promise<void>;
  createReplyAction: (reviewId: string, body: string) => Promise<void>;
  toggleReactionAction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
};

export function DiffViewerClient({
  versions,
  fromVersion,
  toVersion,
  diffText,
  reviews,
  diffLanguage,
  sameVersionCode,
  sameVersionLanguage,
  showRangeSelector = true,
  collapseReviewsByDefault = false,
  createReviewAction,
  createReplyAction,
  toggleReactionAction,
}: Props) {
  const { t } = useI18n();
  const isSameVersion = sameVersionCode !== null && sameVersionCode !== undefined;
  const effectiveLanguage = isSameVersion ? sameVersionLanguage : diffLanguage;
  const rows = useMemo(() => {
    if (isSameVersion) return buildSameVersionRows(sameVersionCode ?? "");
    return parseUnifiedDiff(diffText);
  }, [isSameVersion, sameVersionCode, diffText]);
  const reviewMap = useMemo(() => {
    const map = new Map<number, SubmissionReviewDto[]>();
    for (const review of reviews) {
      const anchor = reviewThreadAnchorLine(review);
      const list = map.get(anchor) ?? [];
      list.push(review);
      map.set(anchor, list);
    }
    return map;
  }, [reviews]);

  /** 각 new 라인 번호를 덮는 리뷰 목록 (범위 하이라이트용). */
  const reviewCoverageByLine = useMemo(() => {
    const map = new Map<number, SubmissionReviewDto[]>();
    for (const review of reviews) {
      const lo = Math.min(review.startLine, review.endLine);
      const hi = Math.max(review.startLine, review.endLine);
      for (let ln = lo; ln <= hi; ln += 1) {
        const list = map.get(ln) ?? [];
        list.push(review);
        map.set(ln, list);
      }
    }
    return map;
  }, [reviews]);
  const [dragAnchorLine, setDragAnchorLine] = useState<number | null>(null);
  const [dragFocusLine, setDragFocusLine] = useState<number | null>(null);
  const [collapsedReviewIds, setCollapsedReviewIds] = useState<Set<string>>(
    () => new Set(collapseReviewsByDefault ? reviews.map((review) => review.id) : []),
  );
  const setReviewCollapsed = (id: string, collapsed: boolean) => {
    setCollapsedReviewIds((prev) => {
      const next = new Set(prev);
      if (collapsed) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const [pendingStartVersion, setPendingStartVersion] = useState<number | null>(null);
  const [pendingFocusVersion, setPendingFocusVersion] = useState<number | null>(null);
  const [optimisticRange, setOptimisticRange] = useState<{ start: number; end: number } | null>(null);
  const [highlightMap, setHighlightMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{
    startLine: number;
    endLine: number;
    body: string;
    tab: "write" | "preview";
  } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const submitReview = useCallback(
    async (formData: FormData) => {
      setDraft(null);
      try {
        await createReviewAction(formData);
        router.refresh();
      } catch (error) {
        if (isNextRedirectError(error)) {
          router.refresh();
          return;
        }
        throw error;
      }
    },
    [createReviewAction, router],
  );
  const versionNodes = useMemo(() => [0, ...versions], [versions]);
  const committedStartVersion = Math.min(fromVersion, toVersion);
  const committedEndVersion = Math.max(fromVersion, toVersion);

  useEffect(() => {
    if (dragAnchorLine === null) return;
    const onWindowMouseUp = () => {
      if (dragFocusLine === null) {
        setDragAnchorLine(null);
        return;
      }
      const startLine = Math.min(dragAnchorLine, dragFocusLine);
      const endLine = Math.max(dragAnchorLine, dragFocusLine);
      setDraft({ startLine, endLine, body: "", tab: "write" });
      setDragAnchorLine(null);
      setDragFocusLine(null);
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, [dragAnchorLine, dragFocusLine]);

  useEffect(() => {
    let cancelled = false;
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "github-dark" : "github-light";
    const lang = resolveShikiLanguage(effectiveLanguage);
    const nonMetaRows = rows.filter((row) => row.kind !== "meta");
    const orderedLines = nonMetaRows.map((row) => splitDiffLine(row.text).content);
    if (orderedLines.length === 0) {
      setHighlightMap({});
      return;
    }

    const blockMask =
      lang === "javascript" || lang === "typescript"
        ? computeJsTsBlockCommentLineMask(orderedLines)
        : null;

    Promise.all(
      nonMetaRows.map(async (row, idx) => {
        const line = orderedLines[idx] ?? "";
        const useBlockCommentStyle = blockMask !== null && blockMask[idx] === true;
        if (useBlockCommentStyle) {
          const inner =
            line.length === 0
              ? "&nbsp;"
              : `<span class="${styles.blockCommentLine}">${escapeHtml(line)}</span>`;
          return [row.key, inner] as const;
        }
        const html = await codeToHtml(line.length > 0 ? line : " ", { lang, theme });
        return [row.key, extractInlineCodeHtml(html, line.length === 0)] as const;
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
  }, [rows, effectiveLanguage]);

  const activeRange =
    dragAnchorLine !== null && dragFocusLine !== null
      ? {
          startLine: Math.min(dragAnchorLine, dragFocusLine),
          endLine: Math.max(dragAnchorLine, dragFocusLine),
        }
      : draft;

  /** 범위 끝 줄에 new 쪽 행이 없으면(예: 제거만 있는 줄) 그 위로 올라가며 코멘트 폼을 붙일 앵커 newLine */
  const draftFormAnchorNewLine = useMemo(() => {
    if (draft === null) return null;
    const lo = Math.min(draft.startLine, draft.endLine);
    const hi = Math.max(draft.startLine, draft.endLine);
    for (let ln = hi; ln >= lo; ln -= 1) {
      const host = rows.find(
        (r) => r.newLine === ln && r.newLine !== null && r.kind !== "remove" && r.kind !== "meta",
      );
      if (host) return ln;
    }
    return null;
  }, [draft, rows]);
  useEffect(() => {
    if (optimisticRange === null) return;
    if (optimisticRange.start === committedStartVersion && optimisticRange.end === committedEndVersion) {
      setOptimisticRange(null);
    }
  }, [optimisticRange, committedStartVersion, committedEndVersion]);

  const activeVersionStart =
    optimisticRange !== null
      ? optimisticRange.start
      : pendingStartVersion === null
      ? committedStartVersion
      : Math.min(pendingStartVersion, pendingFocusVersion ?? pendingStartVersion);
  const activeVersionEnd =
    optimisticRange !== null
      ? optimisticRange.end
      : pendingStartVersion === null
      ? committedEndVersion
      : Math.max(pendingStartVersion, pendingFocusVersion ?? pendingStartVersion);

  return (
    <section className={styles.root}>
      <div className={styles.rangeSelector}>
        {showRangeSelector ? (
          <>
            <div
              className={`${styles.rangeHeader} ${
                pendingStartVersion !== null ? styles.rangeHeaderPending : ""
              }`}
            >
              <strong>
                {t("submission.diff.base")} v{activeVersionStart}
              </strong>
              <span className={styles.rangeDivider}>-</span>
              <strong>
                {t("submission.diff.compare")} v{activeVersionEnd}
              </strong>
            </div>
            <div className={`${styles.timeline} ${pendingStartVersion !== null ? styles.timelinePending : ""}`}>
              {versionNodes.map((versionNo, index) => {
                const inRange = versionNo >= activeVersionStart && versionNo <= activeVersionEnd;
                const isStart = versionNo === activeVersionStart;
                const isEnd = versionNo === activeVersionEnd;
                const segmentActive =
                  index < versionNodes.length - 1 &&
                  versionNo >= activeVersionStart &&
                  versionNo < activeVersionEnd;
                return (
                  <div key={`v-${versionNo}`} className={styles.timelineItem}>
                    <button
                      type="button"
                      className={`${styles.timelineNode} ${inRange ? styles.timelineNodeInRange : ""} ${
                        isStart ? styles.timelineNodeStart : ""
                      } ${isEnd ? styles.timelineNodeEnd : ""}`}
                      onClick={() => {
                        if (pendingStartVersion === null) {
                          setOptimisticRange(null);
                          setPendingStartVersion(versionNo);
                          setPendingFocusVersion(versionNo);
                          return;
                        }
                        const nextFrom = Math.min(pendingStartVersion, versionNo);
                        const nextTo = Math.max(pendingStartVersion, versionNo);
                        setOptimisticRange({ start: nextFrom, end: nextTo });
                        setPendingStartVersion(null);
                        setPendingFocusVersion(null);
                        router.push(`${pathname}?from=${nextFrom}&to=${nextTo}`);
                      }}
                      onMouseEnter={() => {
                        if (pendingStartVersion === null) return;
                        setPendingFocusVersion(versionNo);
                      }}
                    >
                      v{versionNo}
                    </button>
                    {index < versionNodes.length - 1 ? (
                      <span
                        className={`${styles.timelineSegment} ${segmentActive ? styles.timelineSegmentActive : ""}`}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            {rows.map((row) => {
              const lineReviews = row.newLine === null ? [] : (reviewMap.get(row.newLine) ?? []);
              const canComment = row.newLine !== null && row.kind !== "remove" && row.kind !== "meta";
              const lineNo = row.newLine;
              const covering =
                lineNo === null ? [] : (reviewCoverageByLine.get(lineNo) ?? []);
              const reviewSpanKind = classifyReviewSpan(lineNo, covering);
              const inRange =
                activeRange !== null &&
                lineNo !== null &&
                lineNo >= activeRange.startLine &&
                lineNo <= activeRange.endLine;
              const showDraftForm = draft !== null && draftFormAnchorNewLine !== null && lineNo === draftFormAnchorNewLine;
              return (
                <FragmentRow
                  key={row.key}
                  t={t}
                  row={row}
                  lineReviews={lineReviews}
                  reviewSpanKind={reviewSpanKind}
                  canComment={canComment}
                  inRange={inRange}
                  dragging={dragAnchorLine !== null}
                  showDraftForm={showDraftForm}
                  draft={draft}
                  onDraftChange={(next) =>
                    setDraft((prev) =>
                      prev === null
                        ? prev
                        : {
                            ...prev,
                            ...next,
                          },
                    )
                  }
                  onCancelDraft={() => setDraft(null)}
                  onQuickOpen={() => {
                    if (row.newLine === null) return;
                    setDraft({
                      startLine: row.newLine,
                      endLine: row.newLine,
                      body: "",
                      tab: "write",
                    });
                  }}
                  onStartDrag={() => {
                    if (row.newLine === null) return;
                    setDraft(null);
                    setDragAnchorLine(row.newLine);
                    setDragFocusLine(row.newLine);
                  }}
                  onDragEnter={() => {
                    if (dragAnchorLine === null || row.newLine === null) return;
                    setDragFocusLine(row.newLine);
                  }}
                  onEndDrag={() => {
                    if (dragAnchorLine === null || row.newLine === null) return;
                    const startLine = Math.min(dragAnchorLine, row.newLine);
                    const endLine = Math.max(dragAnchorLine, row.newLine);
                    setDraft({ startLine, endLine, body: "", tab: "write" });
                    setDragAnchorLine(null);
                    setDragFocusLine(null);
                  }}
                  toVersion={toVersion}
                  submitReview={submitReview}
                  createReplyAction={createReplyAction}
                  toggleReactionAction={toggleReactionAction}
                  highlightMap={highlightMap}
                  collapsedReviewIds={collapsedReviewIds}
                  onSetReviewCollapsed={setReviewCollapsed}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** v(n)→v(n)처럼 같은 버전을 볼 때 전체 코드를 context 행으로 변환합니다. */
function buildSameVersionRows(code: string): DiffRow[] {
  const lines = code.split("\n");
  const rows: DiffRow[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index === lines.length - 1 && line.length === 0) break;
    rows.push({
      key: `same-${index}`,
      kind: "context",
      oldLine: null,
      newLine: index + 1,
      text: ` ${line}`,
    });
  }
  return rows;
}

function FragmentRow({
  t,
  row,
  lineReviews,
  reviewSpanKind,
  canComment,
  inRange,
  dragging,
  showDraftForm,
  draft,
  onDraftChange,
  onCancelDraft,
  onQuickOpen,
  onStartDrag,
  onDragEnter,
  onEndDrag,
  toVersion,
  submitReview,
  createReplyAction,
  toggleReactionAction,
  highlightMap,
  collapsedReviewIds,
  onSetReviewCollapsed,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  row: DiffRow;
  lineReviews: SubmissionReviewDto[];
  reviewSpanKind: ReviewSpanKind;
  canComment: boolean;
  inRange: boolean;
  dragging: boolean;
  showDraftForm: boolean;
  draft: { startLine: number; endLine: number; body: string; tab: "write" | "preview" } | null;
  onDraftChange: (next: Partial<{ body: string; tab: "write" | "preview" }>) => void;
  onCancelDraft: () => void;
  onQuickOpen: () => void;
  onStartDrag: () => void;
  onDragEnter: () => void;
  onEndDrag: () => void;
  toVersion: number;
  submitReview: (formData: FormData) => Promise<void>;
  createReplyAction: (reviewId: string, body: string) => Promise<void>;
  toggleReactionAction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
  /** 행 키(`row.key`) → 인라인 하이라이트 HTML */
  highlightMap: Record<string, string>;
  collapsedReviewIds: Set<string>;
  onSetReviewCollapsed: (id: string, collapsed: boolean) => void;
}) {
  const rowToneClass =
    row.kind === "add"
      ? styles.addRow
      : row.kind === "remove"
        ? styles.removeRow
        : row.kind === "meta"
          ? styles.metaRow
          : styles.contextRow;

  const reviewSpanClass =
    reviewSpanKind === "single"
      ? styles.reviewSpanSingle
      : reviewSpanKind === "start"
        ? styles.reviewSpanStart
        : reviewSpanKind === "middle"
          ? styles.reviewSpanMiddle
          : reviewSpanKind === "end"
            ? styles.reviewSpanEnd
            : "";

  const lineParts = splitDiffLine(row.text);
  const highlighted = highlightMap[row.key] ?? highlightMap[lineParts.content];
  const collapsedOnLine = lineReviews.filter((r) => collapsedReviewIds.has(r.id));
  const expandedOnLine = lineReviews.filter((r) => !collapsedReviewIds.has(r.id));

  return (
    <>
      <tr
        className={`${styles.diffRow} ${rowToneClass} ${reviewSpanClass} ${inRange ? styles.rangeRow : ""} ${
          dragging ? styles.dragging : ""
        }`}
        onMouseEnter={() => {
          if (!canComment) return;
          onDragEnter();
        }}
        onMouseUp={() => {
          if (!canComment) return;
          onEndDrag();
        }}
      >
        <td className={styles.iconCell}>
          {canComment ? (
            <InlineAddButton
              className={styles.inlineAddBtn}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                onStartDrag();
              }}
              onClick={onQuickOpen}
              aria-label={t("submission.diff.addComment")}
            />
          ) : null}
        </td>
        <td className={styles.lineCell}>{row.oldLine ?? ""}</td>
        <td className={styles.lineCell}>{row.newLine ?? ""}</td>
        <td className={styles.codeCell}>
          {row.kind === "meta" ? (
            row.text
          ) : (
            <>
              <span className={styles.codeSign}>{lineParts.sign}</span>
              <span
                className={styles.codeTokens}
                dangerouslySetInnerHTML={{ __html: highlighted ?? escapeHtml(lineParts.content) }}
              />
            </>
          )}
          {collapsedOnLine.length > 0 ? (
            <div className={styles.collapsedOverlay}>
              {collapsedOnLine.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  className={styles.reviewCollapsedChip}
                  onClick={() => onSetReviewCollapsed(review.id, false)}
                  aria-expanded={false}
                  aria-label={t("submission.diff.reviewThreadExpand")}
                  title={t("submission.diff.reviewThreadExpand")}
                >
                  <UserAvatar
                    nickname={review.authorNickname}
                    imageUrl={review.authorProfileImageUrl}
                    size={26}
                    className={styles.reviewCollapsedAvatar}
                  />
                  {review.replies.length > 0 ? (
                    <span className={styles.reviewReplyCountBadge}>
                      {t("submission.diff.reviewThreadReplyCount", {
                        n: review.replies.length,
                      })}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </td>
      </tr>
      {expandedOnLine.map((review) => (
        <tr key={review.id} className={styles.reviewRow}>
          <td colSpan={4} className={styles.reviewCell}>
            <div className={styles.reviewBox}>
              <ReviewThread
                review={review}
                createReplyAction={createReplyAction}
                toggleReactionAction={toggleReactionAction}
                onCollapse={() => onSetReviewCollapsed(review.id, true)}
              />
            </div>
          </td>
        </tr>
      ))}
      {canComment && showDraftForm && row.newLine !== null && draft !== null ? (
        <tr className={styles.formRow}>
          <td colSpan={4} className={styles.formCell}>
            <form action={submitReview} className={styles.form}>
              <input type="hidden" name="versionNo" value={String(toVersion)} />
              <input type="hidden" name="startLine" value={String(draft.startLine)} />
              <input type="hidden" name="endLine" value={String(draft.endLine)} />
              <input type="hidden" name="body" value={draft.body} />
              <div className={styles.commentBox}>
                <div className={styles.commentHead}>
                  {t("submission.diff.commentTitle", { start: draft.startLine, end: draft.endLine })}
                </div>
                <div className={styles.commentTabs}>
                  <button
                    type="button"
                    className={draft.tab === "write" ? styles.commentTabActive : styles.commentTab}
                    onClick={() => onDraftChange({ tab: "write" })}
                  >
                    {t("submission.diff.write")}
                  </button>
                  <button
                    type="button"
                    className={draft.tab === "preview" ? styles.commentTabActive : styles.commentTab}
                    onClick={() => onDraftChange({ tab: "preview" })}
                  >
                    {t("submission.diff.preview")}
                  </button>
                </div>
                {draft.tab === "write" ? (
                  <textarea
                    required
                    rows={6}
                    className={styles.textarea}
                    placeholder={t("submission.diff.commentPlaceholder")}
                    value={draft.body}
                    onChange={(event) => onDraftChange({ body: event.target.value })}
                  />
                ) : (
                  <div className={styles.previewArea}>
                    {draft.body.trim().length > 0 ? (
                      <MarkdownPreview content={draft.body} />
                    ) : (
                      t("submission.diff.previewEmpty")
                    )}
                  </div>
                )}
                <div className={styles.formActions}>
                  <Button type="button" variant="secondary" onClick={onCancelDraft}>
                    {t("common.cancel")}
                  </Button>
                  <DiffReviewSubmitButton
                    label={t("submission.diff.commentSubmit")}
                    canSubmit={draft.body.trim().length > 0}
                  />
                </div>
              </div>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ReviewThread({
  review,
  createReplyAction,
  toggleReactionAction,
  onCollapse,
}: {
  review: SubmissionReviewDto;
  createReplyAction: (reviewId: string, body: string) => Promise<void>;
  toggleReactionAction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
  onCollapse: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(new Set());

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const onToggleReviewReaction = (emoji: string, reactedByMe: boolean) => {
    const key = `r:${review.id}:${emoji}`;
    if (pendingReactions.has(key)) return;
    setPendingReactions((prev) => new Set(prev).add(key));
    void toggleReactionAction("review", review.id, emoji, reactedByMe).finally(() => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      refresh();
    });
  };

  const onToggleReplyReaction = (
    replyId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => {
    const key = `rr:${replyId}:${emoji}`;
    if (pendingReactions.has(key)) return;
    setPendingReactions((prev) => new Set(prev).add(key));
    void toggleReactionAction("review_reply", replyId, emoji, reactedByMe).finally(() => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      refresh();
    });
  };

  const submitReply = async (body: string) => {
    await createReplyAction(review.id, body);
    refresh();
  };

  const replies = review.replies.map((reply: ReviewReplyDto) => ({
    id: reply.id,
    authorNickname: reply.authorNickname,
    authorProfileImageUrl: reply.authorProfileImageUrl,
    body: reply.body,
    createdAt: reply.createdAt,
    reactions: reply.reactions,
  }));

  const lineLabel =
    review.startLine === review.endLine
      ? `R${review.startLine}`
      : `R${review.startLine}-R${review.endLine}`;

  return (
    <CommentCard
      authorNickname={review.authorNickname}
      authorProfileImageUrl={review.authorProfileImageUrl}
      createdAt={review.createdAt}
      body={review.body}
      header={<span>{t("submission.diff.lineLabel", { line: lineLabel })}</span>}
      headerAction={
        <button
          type="button"
          className={styles.reviewCollapseBtn}
          onClick={onCollapse}
          aria-expanded={true}
        >
          {t("submission.diff.reviewThreadCollapse")}
        </button>
      }
      reactions={review.reactions}
      onToggleReaction={onToggleReviewReaction}
      replies={replies}
      onSubmitReply={submitReply}
      onToggleReplyReaction={onToggleReplyReaction}
    />
  );
}

function splitDiffLine(text: string): { sign: string; content: string } {
  const first = text[0] ?? "";
  if (first === "+" || first === "-" || first === " ") {
    return { sign: first, content: text.slice(1) };
  }
  return { sign: " ", content: text };
}

function extractInlineCodeHtml(html: string, emptyLine: boolean): string {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (match === null) return emptyLine ? "&nbsp;" : "";
  return emptyLine ? "&nbsp;" : match[1];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseUnifiedDiff(diffText: string): DiffRow[] {
  const lines = diffText.split("\n");
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("@@")) {
      const match = /@@ -(\d+),?\d* \+(\d+),?\d* @@/.exec(line);
      if (match !== null) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      rows.push({
        key: `${index}-meta`,
        kind: "meta",
        oldLine: null,
        newLine: null,
        text: line,
      });
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("Index:") || line.startsWith("====")) continue;
    if (line.startsWith("\\ No newline")) continue;

    if (line.startsWith("+")) {
      rows.push({
        key: `${index}-add`,
        kind: "add",
        oldLine: null,
        newLine,
        text: line,
      });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({
        key: `${index}-remove`,
        kind: "remove",
        oldLine,
        newLine: null,
        text: line,
      });
      oldLine += 1;
      continue;
    }
    rows.push({
      key: `${index}-context`,
      kind: "context",
      oldLine,
      newLine,
      text: line.startsWith(" ") ? line : ` ${line}`,
    });
    oldLine += 1;
    newLine += 1;
  }
  return rows;
}
