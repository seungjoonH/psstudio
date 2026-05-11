"use client";

// 랜딩 페이지용 시각 목업 컴포넌트 구현체입니다.
import type { ReactNode } from "react";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { codeToHtml } from "shiki";
import type { CohortSubmissionArtifact } from "../../../src/assignments/server";
import assignStyles from "./assignments/AssignmentListMock.module.css";
import calStyles from "./calendar/GroupCalendarMock.module.css";
import ccStyles from "./comments/CommentCardMock.module.css";
import cohortStyles from "./cohort/CohortAnalysisMock.module.css";
import diffStyles from "./diff/DiffViewerMock.module.css";
import groupsExploreStyles from "./groups/GroupsExploreMock.module.css";
import homeStyles from "./home/HomeDashboardMock.module.css";
import nf from "./notifications/NotificationsListMock.module.css";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { AI_TUTOR_PROFILE_IMAGE_URL } from "../../../src/lib/aiTutorProfileImageUrl";
import { buildCls } from "../../../src/lib/buildCls";
import { formatCalendarWeekRangeLabel } from "../../../src/lib/formatCalendarWeekRangeLabel";
import { computeJsTsBlockCommentLineMask } from "../../../src/lib/jsBlockCommentLineMask";
import { resolveShikiLanguage } from "../../../src/lib/shikiLanguage";
import { dueBadgeTone } from "../../../src/lib/dueBadgeTone";
import landingPageStyles from "../landing.module.css";
import { AssignmentNotificationGlyph } from "../../../src/ui/AssignmentNotificationGlyph";
import { DeadlineSoonNotificationGlyph } from "../../../src/ui/DeadlineSoonNotificationGlyph";
import { Badge } from "../../../src/ui/Badge";
import btnStyles from "../../../src/ui/Button.module.css";
import { Button } from "../../../src/ui/Button";
import { DifficultyBadge } from "../../../src/ui/DifficultyBadge";
import type { IconName } from "../../../src/ui/Icon";
import { Icon } from "../../../src/ui/Icon";
import { InlineAddButton } from "../../../src/ui/InlineAddButton";
import { CohortCodeColumns } from "../../../src/ui/cohort/CohortCodeColumns";
import { CohortReportBody } from "../../../src/ui/cohort/CohortReportBody";
import { MarkdownPreview } from "../../../src/ui/MarkdownPreview";
import { SegmentedControl } from "../../../src/ui/SegmentedControl";
import { UserAvatar } from "../../../src/ui/UserAvatar";
import styles from "../LandingVisualMockups.module.css";

/** 랜딩 집단 분석 목업에서 리포트 칩·코드 열에 쓰는 고정 ID입니다. */
const LANDING_COHORT_IDS = {
  groupId: "00000000-0000-4000-8000-00000000c0a1",
  assignmentId: "00000000-0000-4000-8000-00000000c0a2",
  js: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  py: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
} as const;

const LANDING_REVIEW_AI_DELAY_MS = 5000;

/** 랜딩 diff 목업의 코드 행(줄 번호·부호·i18n 키)입니다. */
const LANDING_DIFF_CODE_ROWS = [
  { kind: "context" as const, oldNum: 12, newNum: 12, textKey: "landing.mockDiffPre1", sign: " " as const },
  { kind: "context" as const, oldNum: 13, newNum: 13, textKey: "landing.mockDiffPre2", sign: " " as const },
  { kind: "context" as const, oldNum: 14, newNum: 14, textKey: "landing.mockDiffPre3", sign: " " as const },
  { kind: "context" as const, oldNum: 15, newNum: 15, textKey: "landing.mockDiffCtx", sign: " " as const },
  { kind: "context" as const, oldNum: 16, newNum: 16, textKey: "landing.mockDiffCtxGap", sign: " " as const },
  { kind: "remove" as const, oldNum: 17, newNum: null, textKey: "landing.mockDiffOld1", sign: "-" as const },
  { kind: "remove" as const, oldNum: 18, newNum: null, textKey: "landing.mockDiffOld2", sign: "-" as const },
  { kind: "add" as const, oldNum: null, newNum: 17, textKey: "landing.mockDiffNew1", sign: "+" as const },
  { kind: "add" as const, oldNum: null, newNum: 18, textKey: "landing.mockDiffNew2", sign: "+" as const },
  { kind: "add" as const, oldNum: null, newNum: 19, textKey: "landing.mockDiffNew3", sign: "+" as const },
  { kind: "context" as const, oldNum: 20, newNum: 20, textKey: "landing.mockDiffPostCtx", sign: " " as const },
  { kind: "context" as const, oldNum: 21, newNum: 21, textKey: "landing.mockDiffElseHi", sign: " " as const },
  { kind: "context" as const, oldNum: 22, newNum: 22, textKey: "landing.mockDiffCloseWhile", sign: " " as const },
  { kind: "context" as const, oldNum: 23, newNum: 23, textKey: "landing.mockDiffReturnLine", sign: " " as const },
] as const;

const LANDING_MINJI_THREAD_AFTER_ROW = 9;
const LANDING_AI_THREAD_AFTER_ROW = 11;

type LandingReviewAiMockValue = {
  aiCommentVisible: boolean;
  aiLoading: boolean;
  requestAiFeedback: () => void;
};

const LandingReviewAiMockContext = createContext<LandingReviewAiMockValue | null>(null);

export function LandingReviewAiMockProvider({ children }: { children: ReactNode }) {
  const [aiCommentVisible, setAiCommentVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const requestAiFeedback = useCallback(() => {
    if (aiCommentVisible || aiLoading) return;
    setAiLoading(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setAiLoading(false);
      setAiCommentVisible(true);
    }, LANDING_REVIEW_AI_DELAY_MS);
  }, [aiCommentVisible, aiLoading]);

  const value = useMemo(
    () => ({ aiCommentVisible, aiLoading, requestAiFeedback }),
    [aiCommentVisible, aiLoading, requestAiFeedback],
  );

  return <LandingReviewAiMockContext.Provider value={value}>{children}</LandingReviewAiMockContext.Provider>;
}

function useLandingReviewAiMock(): LandingReviewAiMockValue {
  const v = useContext(LandingReviewAiMockContext);
  if (!v) {
    throw new Error("useLandingReviewAiMock: LandingReviewAiMockProvider로 감싸야 합니다.");
  }
  return v;
}

function landingDiffLineNumsInRange(fromIdx: number, toIdx: number): [number, number] {
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const nums: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const r = LANDING_DIFF_CODE_ROWS[i];
    if (r.oldNum != null) nums.push(r.oldNum);
    if (r.newNum != null) nums.push(r.newNum);
  }
  if (nums.length === 0) return [lo + 1, hi + 1];
  return [Math.min(...nums), Math.max(...nums)];
}

function formatLandingDiffLineRef(locale: string, fromIdx: number, toIdx: number): string {
  const [a, b] = landingDiffLineNumsInRange(fromIdx, toIdx);
  const ko = locale.toLowerCase().startsWith("ko");
  if (a === b) return ko ? `라인 ${a}` : `Line ${a}`;
  return ko ? `라인 ${a}–${b}` : `Lines ${a}–${b}`;
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const CAL_PILL_KEYS = [
  "landing.mockPgCal1",
  "landing.mockPgCal2",
  "landing.mockPgCal3",
  "landing.mockPgCal4",
  "landing.mockPgCal5",
  "landing.mockPgCal6",
  "landing.mockPgCal7",
  "landing.mockPgCal8",
  "landing.mockPgCal9",
  "landing.mockPgCal10",
  "landing.mockPgCal11",
  "landing.mockPgCal12",
] as const;

/** 2026년 5월 월간 그리드. pills는 CAL_PILL_KEYS 인덱스(0부터). */
const MAY_2026_CAL: { day: number; outside: boolean; today: boolean; pills?: number[] }[] = [
  { day: 26, outside: true, today: false },
  { day: 27, outside: true, today: false },
  { day: 28, outside: true, today: false },
  { day: 29, outside: true, today: false },
  { day: 30, outside: true, today: false },
  { day: 1, outside: false, today: false, pills: [0] },
  { day: 2, outside: false, today: false },
  { day: 3, outside: false, today: false, pills: [1, 2] },
  { day: 4, outside: false, today: false, pills: [3] },
  { day: 5, outside: false, today: false },
  { day: 6, outside: false, today: false, pills: [4, 5] },
  { day: 7, outside: false, today: false },
  { day: 8, outside: false, today: false, pills: [6] },
  { day: 9, outside: false, today: false, pills: [7, 8] },
  { day: 10, outside: false, today: false, pills: [9] },
  { day: 11, outside: false, today: true },
  { day: 12, outside: false, today: false, pills: [10] },
  { day: 13, outside: false, today: false, pills: [0] },
  { day: 14, outside: false, today: false, pills: [11] },
  { day: 15, outside: false, today: false, pills: [2] },
  { day: 16, outside: false, today: false, pills: [4, 11] },
  { day: 17, outside: false, today: false, pills: [7, 3] },
  { day: 18, outside: false, today: false, pills: [6] },
  { day: 19, outside: false, today: false, pills: [2, 5] },
  { day: 20, outside: false, today: false, pills: [9] },
  { day: 21, outside: false, today: false, pills: [1] },
  { day: 22, outside: false, today: false, pills: [10] },
  { day: 23, outside: false, today: false, pills: [8] },
];

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** 랜딩 2026년 5월 목업 셀 → Date(로컬). */
function landingMockMayCellToDate(cell: { day: number; outside: boolean }): Date {
  if (cell.outside && cell.day >= 26) return new Date(2026, 3, cell.day);
  return new Date(2026, 4, cell.day);
}

/** 랜딩 미니 캘린더에서 "오늘"로 쓰는 고정 목업 날짜입니다. */
const LANDING_CAL_MOCK_TODAY = new Date(2026, 4, 11);

function landingDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LANDING_MAY_2026_PILLS_BY_DATE_KEY: Map<string, number[]> = (() => {
  const m = new Map<string, number[]>();
  for (const cell of MAY_2026_CAL) {
    if (!cell.pills?.length) continue;
    const dt = landingMockMayCellToDate(cell);
    m.set(landingDateKey(dt), [...cell.pills]);
  }
  return m;
})();

function landingSameCalendarDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function landingAddMonthsClampDay(d: Date, delta: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + delta;
  const day = d.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last));
}

type LandingMiniCalCell = {
  day: number;
  outside: boolean;
  today: boolean;
  pills?: number[];
  fullDate: Date;
};

function landingBuildMonthGrid(monthStartFirst: Date, mockToday: Date): LandingMiniCalCell[] {
  const year = monthStartFirst.getFullYear();
  const month = monthStartFirst.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells: LandingMiniCalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const inMonth = d.getMonth() === month && d.getFullYear() === year;
    const outside = !inMonth;
    const today = landingSameCalendarDate(d, mockToday);
    const k = landingDateKey(d);
    const raw = LANDING_MAY_2026_PILLS_BY_DATE_KEY.get(k);
    const pills = raw ? [...raw] : undefined;
    cells.push({ day: d.getDate(), outside, today, pills, fullDate: d });
  }
  return cells;
}

function landingBuildWeekCells(weekContaining: Date, mockToday: Date): LandingMiniCalCell[] {
  const ref = new Date(weekContaining);
  ref.setHours(0, 0, 0, 0);
  const start = new Date(ref);
  start.setDate(ref.getDate() - ref.getDay());
  const cells: LandingMiniCalCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const inMay2026 = d.getFullYear() === 2026 && d.getMonth() === 4;
    const outside = !inMay2026;
    const today = landingSameCalendarDate(d, mockToday);
    const k = landingDateKey(d);
    const raw = LANDING_MAY_2026_PILLS_BY_DATE_KEY.get(k);
    const pills = raw ? [...raw] : undefined;
    cells.push({ day: d.getDate(), outside, today, pills, fullDate: d });
  }
  return cells;
}

type HeroNotifyKind = "assignment" | "user" | "deadline";

type HeroNotifyRow = {
  id: string;
  kind: HeroNotifyKind;
  title: string;
  when: string;
  actor?: string;
};

export function MiniNotifyList({
  ariaLabel,
  maxItems,
  compact,
  heroTitleId,
}: {
  ariaLabel: string;
  maxItems?: number;
  /** true일 때 칸반 열 안: 바깥 notifyShowcase와 이중 테두리를 만들지 않음 */
  compact?: boolean;
  /** 히어로 단독 블록(2번 레퍼런스): 제목·전체 삭제를 한 줄에 두고 목록은 그 아래 */
  heroTitleId?: string;
}) {
  const { locale, t } = useI18n();
  const h = homeStyles;
  const noop = () => {};

  const seedRows = useMemo(
    (): HeroNotifyRow[] => [
      {
        id: "landing-mock-notify-a",
        kind: "assignment",
        title: t("landing.mockNotifyAssignCreatedTitle"),
        when: formatDateTime(t("landing.mockNotifyAssignCreatedAtIso"), locale),
      },
      {
        id: "landing-mock-notify-1",
        kind: "user",
        title: t("landing.mockNotify1Title"),
        when: formatDateTime(t("landing.mockNotify1AtIso"), locale),
        actor: t("landing.mockNotify1Actor"),
      },
      {
        id: "landing-mock-notify-4",
        kind: "user",
        title: t("landing.mockNotify4Title"),
        when: formatDateTime(t("landing.mockNotify4AtIso"), locale),
        actor: t("landing.mockNotify4Actor"),
      },
      {
        id: "landing-mock-notify-2",
        kind: "deadline",
        title: t("landing.mockNotify2Title"),
        when: formatDateTime(t("landing.mockNotify2AtIso"), locale),
      },
      {
        id: "landing-mock-notify-3",
        kind: "user",
        title: t("landing.mockNotify3Title"),
        when: formatDateTime(t("landing.mockNotify3AtIso"), locale),
        actor: t("landing.mockNotify3Actor"),
      },
    ],
    [locale, t],
  );

  const [heroRowsOverride, setHeroRowsOverride] = useState<HeroNotifyRow[] | null>(null);
  useEffect(() => {
    setHeroRowsOverride(null);
  }, [locale]);

  const heroRows = heroTitleId ? (heroRowsOverride ?? seedRows) : seedRows;
  const shown = maxItems !== undefined ? seedRows.slice(0, maxItems) : seedRows;

  const rootProps = compact
    ? ({ "aria-hidden": true as const } as const)
    : ({ role: "region" as const, "aria-label": ariaLabel } as const);

  const rowFace = (item: HeroNotifyRow, avatarClass: string) =>
    item.kind === "assignment" ? (
      <AssignmentNotificationGlyph className={avatarClass} />
    ) : item.kind === "deadline" ? (
      <DeadlineSoonNotificationGlyph className={avatarClass} />
    ) : (
      <UserAvatar nickname={item.actor ?? ""} imageUrl="" size={40} className={avatarClass} />
    );

  if (compact) {
    return (
      <div
        className={buildCls(styles.landingNotifyRoot, styles.landingNotifyCompact)}
        {...rootProps}
      >
        <ul className={h.list}>
          {shown.map((item) => (
            <li key={item.id}>
              <div className={h.feedRowStatic}>
                {rowFace(item, h.feedAvatar)}
                <div className={h.feedMain}>
                  <span className={h.notifTitle}>{item.title}</span>
                  <span className={h.listTime}>{item.when}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const onHeroDeleteOne = (id: string) => {
    setHeroRowsOverride((prev) => {
      const cur = prev ?? seedRows;
      return cur.filter((r) => r.id !== id);
    });
  };

  const onHeroDeleteAll = () => {
    setHeroRowsOverride([]);
  };

  const list = (
    <ul className={nf.list}>
      {shown.map((item) => (
        <li key={item.id} className={buildCls(nf.row, styles.landingHeroNotifyRow)}>
          <div className={buildCls(nf.rowMain, styles.landingHeroNotifyRowMain)}>
            {rowFace(item, nf.avatar)}
            <div className={nf.rowBody}>
              <span className={nf.title}>{item.title}</span>
              <span className={nf.time}>{item.when}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className={buildCls(nf.deleteBtn, styles.landingHeroNotifyDelete)}
            aria-label={t("notifications.deleteOneAria")}
            onClick={noop}
          >
            {t("notifications.deleteOne")}
          </Button>
        </li>
      ))}
    </ul>
  );

  if (heroTitleId) {
    const heroList = (
      <ul className={nf.list}>
        {heroRows.map((item) => (
          <li key={item.id} className={buildCls(nf.row, styles.landingHeroNotifyRow)}>
            <div className={buildCls(nf.rowMain, styles.landingHeroNotifyRowMain)}>
              {rowFace(item, nf.avatar)}
              <div className={nf.rowBody}>
                <span className={nf.title}>{item.title}</span>
                <span className={nf.time}>{item.when}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className={buildCls(nf.deleteBtn, styles.landingHeroNotifyDelete)}
              aria-label={t("notifications.deleteOneAria")}
              onClick={() => onHeroDeleteOne(item.id)}
            >
              {t("notifications.deleteOne")}
            </Button>
          </li>
        ))}
      </ul>
    );

    return (
      <div className={landingPageStyles.notifyShowcaseListPack} {...rootProps}>
        <div className={landingPageStyles.heroNotifyHead}>
          <h2 id={heroTitleId} className={landingPageStyles.heroNotifyTitle}>
            {t("landing.mockNotificationsListTitle")}
          </h2>
          {heroRows.length > 0 ? (
            <Button type="button" variant="danger" onClick={onHeroDeleteAll}>
              {t("notifications.deleteAll")}
            </Button>
          ) : null}
        </div>
        <div className={styles.landingNotifyRoot}>
          {heroRows.length === 0 ? <p className={nf.empty}>{t("notifications.empty")}</p> : heroList}
        </div>
      </div>
    );
  }

  return <div className={styles.landingNotifyRoot} {...rootProps}>{list}</div>;
}

export function LandingHeroDecor() {
  return (
    <div className={styles.decorWrap}>
      <img className={styles.decorImg} src="/landing/hero-mesh.svg" alt="" width={420} height={300} />
    </div>
  );
}

const LANDING_TODO_MOCKS = [
  {
    titleKey: "landing.mockKanbanTodo3Title",
    groupKey: "landing.mockKanbanTodo3Group",
    platformKey: "landing.mockKanbanTodo3Platform",
    difficultyKey: "landing.mockKanbanTodo3Difficulty",
    algoKey: "landing.mockKanbanTodo3Algo",
    dueIsoKey: "landing.mockKanbanTodo3DueIso",
    solved: false,
  },
  {
    titleKey: "landing.mockKanbanTodo4Title",
    groupKey: "landing.mockKanbanTodo4Group",
    platformKey: "landing.mockKanbanTodo4Platform",
    difficultyKey: "landing.mockKanbanTodo4Difficulty",
    algoKey: "landing.mockKanbanTodo4Algo",
    dueIsoKey: "landing.mockKanbanTodo4DueIso",
    solved: false,
  },
  {
    titleKey: "landing.mockKanbanTodo1Title",
    groupKey: "landing.mockKanbanTodo1Group",
    platformKey: "landing.mockKanbanTodo1Platform",
    difficultyKey: "landing.mockKanbanTodo1Difficulty",
    algoKey: "landing.mockKanbanTodo1Algo",
    dueIsoKey: "landing.mockKanbanTodo1DueIso",
    solved: false,
  },
] as const;

const LANDING_DONE_MOCKS = [
  {
    titleKey: "landing.mockHomeDoneTitle",
    langKey: "landing.mockHomeDoneLang",
    atIsoKey: "landing.mockHomeDoneAtIso",
  },
  {
    titleKey: "landing.mockHomeDone2Title",
    langKey: "landing.mockHomeDone2Lang",
    atIsoKey: "landing.mockHomeDone2AtIso",
  },
  {
    titleKey: "landing.mockHomeDone3Title",
    langKey: "landing.mockHomeDone3Lang",
    atIsoKey: "landing.mockHomeDone3AtIso",
  },
  {
    titleKey: "landing.mockHomeDone4Title",
    langKey: "landing.mockHomeDone4Lang",
    atIsoKey: "landing.mockHomeDone4AtIso",
  },
] as const;

/** 홈과 동일 CSS. 3열(해야 할 일·한 일·최근 알림 미리보기) + 하단 전체 알림은 LandingClient에서 분리 렌더. */
export function MiniHomeKanban({ ariaLabel }: { ariaLabel: string }) {
  const { locale, t } = useI18n();
  const h = homeStyles;
  const todoRowsSorted = useMemo(() => {
    const rows = [...LANDING_TODO_MOCKS];
    rows.sort((a, b) => {
      const aSolved = a.solved ? 1 : 0;
      const bSolved = b.solved ? 1 : 0;
      if (aSolved !== bSolved) return aSolved - bSolved;
      return new Date(t(a.dueIsoKey)).getTime() - new Date(t(b.dueIsoKey)).getTime();
    });
    return rows;
  }, [locale, t]);

  return (
    <div className={styles.landingHomeOuter} role="img" aria-label={ariaLabel}>
      <div className={h.dashboard}>
        <div className={h.stats} aria-hidden>
          <div className={h.statCard}>
            <span className={h.statValue}>{t("landing.mockHomeStatTodo")}</span>
            <span className={h.statLabel}>{t("home.kanban.todoCount")}</span>
          </div>
          <div className={h.statCard}>
            <span className={h.statValue}>{t("landing.mockHomeStatDone")}</span>
            <span className={h.statLabel}>{t("home.kanban.doneCount")}</span>
          </div>
        </div>

        <section className={h.board} aria-hidden>
          <article className={h.column}>
            <header className={h.columnHead}>
              <span className={buildCls(h.cardIcon, h.todoIcon)} aria-hidden>
                <Icon name="calendar" size={16} />
              </span>
              <div>
                <h3 className={h.cardTitle}>{t("home.kanban.todoTitle")}</h3>
                <p className={h.cardDesc}>{t("home.kanban.todoDesc")}</p>
              </div>
            </header>
            <div className={h.columnBody}>
              <ul className={h.list}>
                {todoRowsSorted.map((row) => {
                  const dueAt = t(row.dueIsoKey);
                  const dueMs = new Date(dueAt).getTime();
                  const now = Date.now();
                  const todoLate = dueMs < now;
                  const rawDaysLeft = Math.max(0, Math.ceil((dueMs - now) / (24 * 60 * 60 * 1000)));
                  const displayDays = Math.min(10, rawDaysLeft);
                  const dueTone = dueBadgeTone(todoLate, displayDays);
                  const platformLabel = t(row.platformKey);
                  return (
                    <li key={row.titleKey}>
                      <div
                        className={buildCls(h.feedRowStatic, todoLate ? h.feedRowPastDue : undefined)}
                      >
                        <div className={h.todoCardRow}>
                          <div className={h.todoCardMain}>
                            <div className={h.todoTitleStrip}>
                              <div className={h.todoTitleLeft}>
                                <span className={buildCls(h.kanbanItemTitle, styles.psProblemTitle)}>
                                  <Icon name="book" size={14} className={h.kanbanItemTitleIcon} aria-hidden />
                                  <span className={h.kanbanItemTitleText}>{t(row.titleKey)}</span>
                                </span>
                                <Badge tone="neutral" chipIndex={0}>
                                  {t(row.groupKey)}
                                </Badge>
                              </div>
                              <span className={h.todoTitleDue}>
                                <Badge tone={dueTone}>{todoLate ? t("assignment.list.late") : `D-${displayDays}`}</Badge>
                              </span>
                            </div>
                            <div className={h.todoMetaRow}>
                              <Badge tone="neutral" chipIndex={1}>
                                {platformLabel}
                              </Badge>
                              <DifficultyBadge platform={platformLabel} difficulty={t(row.difficultyKey)} />
                            </div>
                            <div className={h.todoMetaRow}>
                              <Badge tone="neutral">{t(row.algoKey)}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>

          <article className={h.column}>
            <header className={h.columnHead}>
              <span className={buildCls(h.cardIcon, h.doneIcon)} aria-hidden>
                <Icon name="check" size={16} />
              </span>
              <div>
                <h3 className={h.cardTitle}>{t("home.kanban.doneTitle")}</h3>
                <p className={h.cardDesc}>{t("home.kanban.doneDesc")}</p>
              </div>
            </header>
            <div className={h.columnBody}>
              <ul className={h.list}>
                {LANDING_DONE_MOCKS.map((row) => (
                  <li key={row.titleKey}>
                    <div className={h.feedRowStatic}>
                      <div className={h.feedMain}>
                        <span className={buildCls(h.listTitle, styles.psProblemTitle)}>{t(row.titleKey)}</span>
                        <span className={h.listMeta}>
                          <Badge tone="neutral">{resolveShikiLanguage(t(row.langKey))}</Badge>
                          <span className={h.listTime}>{formatDateTime(t(row.atIsoKey), locale)}</span>
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className={h.column}>
            <header className={h.columnHead}>
              <span className={buildCls(h.cardIcon, h.noticeIcon)} aria-hidden>
                <Icon name="mail" size={16} />
              </span>
              <div className={h.columnHeadBody}>
                <div className={h.columnHeadTop}>
                  <h3 className={h.cardTitle}>{t("landing.mockNotificationsListTitle")}</h3>
                  <span className={buildCls(h.viewAllLink, styles.landingFakeLink)} tabIndex={-1} aria-hidden>
                    {t("home.recent.notifications.viewAll")}
                  </span>
                </div>
                <p className={h.cardDesc}>{t("home.kanban.noticeDesc")}</p>
              </div>
            </header>
            <div className={h.columnBody}>
              <MiniNotifyList ariaLabel={t("landing.mockupNotifyPreviewAria")} compact />
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

export function MiniCalendar({ ariaLabel }: { ariaLabel: string }) {
  const { t, locale } = useI18n();
  const c = calStyles;
  const router = useRouter();
  const [anchorDate, setAnchorDate] = useState(() => new Date(LANDING_CAL_MOCK_TODAY));
  const [calView, setCalView] = useState<"month" | "week">("month");

  const monthStart = useMemo(() => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1), [anchorDate]);

  const gridCells = useMemo(() => {
    return calView === "week"
      ? landingBuildWeekCells(anchorDate, LANDING_CAL_MOCK_TODAY)
      : landingBuildMonthGrid(monthStart, LANDING_CAL_MOCK_TODAY);
  }, [anchorDate, calView, monthStart]);

  const periodCaption = useMemo(() => {
    const loc = locale === "ko" ? "ko-KR" : "en-US";
    if (calView === "month") {
      return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(monthStart);
    }
    const start = new Date(anchorDate);
    start.setDate(anchorDate.getDate() - anchorDate.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return formatCalendarWeekRangeLabel(loc, start, end);
  }, [anchorDate, calView, locale, monthStart]);

  const onPrev = () => {
    if (calView === "month") {
      setAnchorDate((d) => landingAddMonthsClampDay(d, -1));
    } else {
      setAnchorDate((d) => {
        const n = new Date(d);
        n.setDate(n.getDate() - 7);
        return n;
      });
    }
  };

  const onNext = () => {
    if (calView === "month") {
      setAnchorDate((d) => landingAddMonthsClampDay(d, 1));
    } else {
      setAnchorDate((d) => {
        const n = new Date(d);
        n.setDate(n.getDate() + 7);
        return n;
      });
    }
  };

  const gridClass =
    calView === "week"
      ? buildCls(c.weekGrid, styles.landingMiniCalWeekGrid)
      : buildCls(c.monthGrid, styles.landingMiniCalGrid);

  return (
    <div className={buildCls(c.calendarCard, styles.landingMiniCal, styles.landingMiniCalWide)} role="region" aria-label={ariaLabel}>
      <header className={buildCls(c.calendarHeader, styles.landingMiniCalHeader)}>
        <div className={buildCls(c.headerActions, styles.landingMiniCalHeaderActions)}>
          <div className={c.periodNav}>
            <button type="button" className={c.iconNavBtn} onClick={onPrev} aria-label={t("groupCalendar.prev")}>
              <Icon name="chevronRight" size={16} className={c.chevronLeft} aria-hidden />
            </button>
            <strong className={buildCls(c.periodLabel, styles.landingMiniCalPeriodLabel)}>{periodCaption}</strong>
            <button type="button" className={c.iconNavBtn} onClick={onNext} aria-label={t("groupCalendar.next")}>
              <Icon name="chevronRight" size={16} aria-hidden />
            </button>
          </div>
          <div className={buildCls(c.rightActions, styles.landingMiniCalRight)}>
            <button
              type="button"
              className={buildCls(c.todayLink, styles.landingMiniCalTodayBtn)}
              onClick={() => setAnchorDate(new Date(LANDING_CAL_MOCK_TODAY))}
            >
              {t("groupCalendar.today")}
            </button>
            <div className={c.viewSegmentWrap}>
              <SegmentedControl
                name="landingCalView"
                defaultValue="month"
                value={calView}
                onValueChange={(v) => setCalView(v === "week" ? "week" : "month")}
                aria-label={t("groupCalendar.viewAria")}
                noWrap
                options={[
                  { value: "week", label: t("landing.mockCalWeekFocus") },
                  { value: "month", label: t("groupCalendar.month") },
                ]}
              />
            </div>
            <span
              className={buildCls(btnStyles.root, btnStyles.secondary, styles.landingMiniCalFilterFake)}
              aria-hidden
              tabIndex={-1}
            >
              <span className={btnStyles.icon}>
                <Icon name="filter" size={16} />
              </span>
              <span className={btnStyles.label}>{t("assignment.list.filter")}</span>
            </span>
            <Button type="button" variant="primary" onClick={() => router.push("/login")}>
              {t("assignment.list.create")}
            </Button>
          </div>
        </div>
      </header>

      <div className={c.weekHeader} aria-hidden>
        {WEEKDAY_KEYS.map((d) => (
          <span key={d} className={c.weekLabel}>
            {t(`groupCalendar.weekday.${d}`)}
          </span>
        ))}
      </div>

      <div className={gridClass}>
        {gridCells.map((cell, idx) => (
          <section
            key={`${calView}-${landingDateKey(cell.fullDate)}-${idx}`}
            className={buildCls(
              c.dayCell,
              styles.landingMiniCalDayCell,
              cell.today ? c.dayCellToday : "",
              cell.outside ? c.dayCellMuted : "",
            ).trim()}
          >
            <div className={buildCls(c.dayCellHit, styles.landingMiniCalDayHit)}>
              <header className={c.dayHead}>
                <span className={buildCls(c.dayNumber, cell.outside ? c.dayNumberMuted : "").trim()}>{cell.day}</span>
              </header>
              <ul className={buildCls(c.assignmentList, styles.landingMiniCalAssignmentList)}>
                {(cell.pills ?? []).map((pillIdx) => {
                  const key = CAL_PILL_KEYS[pillIdx];
                  if (key === undefined) return null;
                  return (
                    <li
                      key={`${landingDateKey(cell.fullDate)}-${pillIdx}`}
                      className={buildCls(c.assignmentRow, styles.landingMiniCalAssignmentRow)}
                    >
                      <span className={buildCls(c.assignmentPill, styles.landingMiniCalPill)}>
                        <span className={c.assignmentTitle}>{t(key)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

type LandingGroupMockRow = {
  nameKey: string;
  /** `/groups` 목록의 `myPendingAssignmentCount`와 동일 의미(미제출 활성 과제 수) */
  myPendingAssignmentCount: number;
  memberCount: number;
  members: { nickname: string; imageUrl: string }[];
  descriptionKey?: string;
};

const LANDING_GROUP_MOCKS: LandingGroupMockRow[] = [
  {
    nameKey: "landing.mockGroup1Name",
    descriptionKey: "landing.mockGroup1Description",
    myPendingAssignmentCount: 2,
    memberCount: 4,
    members: [
      { nickname: "윤하", imageUrl: "https://picsum.photos/seed/psstudio-landing-g1-0/96/96" },
      { nickname: "태양", imageUrl: "" },
      { nickname: "서준", imageUrl: "https://picsum.photos/seed/psstudio-landing-g1-2/96/96" },
    ],
  },
  {
    nameKey: "landing.mockGroup2Name",
    myPendingAssignmentCount: 1,
    memberCount: 3,
    members: [
      { nickname: "하린", imageUrl: "" },
      { nickname: "도윤", imageUrl: "https://picsum.photos/seed/psstudio-landing-g2-1/96/96" },
      { nickname: "채원", imageUrl: "" },
    ],
  },
  {
    nameKey: "landing.mockGroup3Name",
    descriptionKey: "landing.mockGroup3Description",
    myPendingAssignmentCount: 1,
    memberCount: 5,
    members: [
      { nickname: "유진", imageUrl: "" },
      { nickname: "시우", imageUrl: "https://picsum.photos/seed/psstudio-landing-g3-1/96/96" },
      { nickname: "다은", imageUrl: "https://picsum.photos/seed/psstudio-landing-g3-2/96/96" },
    ],
  },
  {
    nameKey: "landing.mockGroup4Name",
    myPendingAssignmentCount: 0,
    memberCount: 2,
    members: [
      { nickname: "준호", imageUrl: "" },
      { nickname: "수아", imageUrl: "" },
    ],
  },
  {
    nameKey: "landing.mockGroup5Name",
    myPendingAssignmentCount: 0,
    memberCount: 1,
    members: [{ nickname: "지은", imageUrl: "" }],
  },
];

export function MiniGroupsStrip({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();
  const gx = groupsExploreStyles;

  return (
    <div className={buildCls(gx.layout, styles.landingGroupsWrap)} role="img" aria-label={ariaLabel}>
      <ul className={gx.grid}>
        {LANDING_GROUP_MOCKS.map((row) => {
          const rawDesc = row.descriptionKey !== undefined ? t(row.descriptionKey).trim() : "";
          const desc = rawDesc.length > 0 ? rawDesc : null;
          return (
            <li key={row.nameKey} className={gx.card}>
              <div className={gx.cardLink}>
                <strong className={gx.groupName}>
                  <Icon name="users" size={16} className={gx.groupNameIcon} aria-hidden />
                  {t(row.nameKey)}
                </strong>
                <p className={gx.groupDescription}>{desc}</p>
                <span className={gx.groupMeta}>
                  {t("groups.memberCount", { count: row.memberCount })}
                  {" · "}
                  {t("groupsExplore.pendingTodos", { count: row.myPendingAssignmentCount })}
                </span>
                <div className={gx.avatarStack} aria-hidden>
                  {row.members.slice(0, 3).map((m) => (
                    <UserAvatar
                      key={`${row.nameKey}-${m.nickname}`}
                      nickname={m.nickname}
                      imageUrl={m.imageUrl}
                      size={44}
                      className={gx.avatar}
                    />
                  ))}
                  {row.memberCount > 3 ? (
                    <span className={gx.avatarMore}>+{row.memberCount - 3}</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 랜딩 과제 스트립: 오늘 기준 일수 오프셋만 사용해 D-1~D-10·마감 배지가 항상 의도대로 보이게 합니다. */
const LANDING_ASSIGNMENT_SHOWCASE = [
  {
    titleKey: "landing.mockAssignShow1Title",
    platformKey: "landing.mockAssignShow1Platform",
    difficultyKey: "landing.mockAssignShow1Difficulty",
    dueOffsetDays: 10,
    solved: false,
  },
  {
    titleKey: "landing.mockAssignShow2Title",
    platformKey: "landing.mockAssignShow2Platform",
    difficultyKey: "landing.mockAssignShow2Difficulty",
    dueOffsetDays: 3,
    solved: true,
  },
  {
    titleKey: "landing.mockAssignShow3Title",
    platformKey: "landing.mockAssignShow3Platform",
    difficultyKey: "landing.mockAssignShow3Difficulty",
    dueOffsetDays: 1,
    solved: false,
  },
  {
    titleKey: "landing.mockAssignShow4Title",
    platformKey: "landing.mockAssignShow4Platform",
    difficultyKey: "landing.mockAssignShow4Difficulty",
    dueOffsetDays: -2,
    solved: false,
  },
] as const;

export function MiniAssignmentShowcase({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();
  const a = assignStyles;
  const assignShowRowsSorted = useMemo(() => {
    const anchor = Date.now();
    const dayMs = 24 * 3600 * 1000;
    const rows = LANDING_ASSIGNMENT_SHOWCASE.map((row) => ({
      ...row,
      dueAt: new Date(anchor + row.dueOffsetDays * dayMs).toISOString(),
    }));
    rows.sort((aRow, bRow) => {
      const aSolved = aRow.solved ? 1 : 0;
      const bSolved = bRow.solved ? 1 : 0;
      if (aSolved !== bSolved) return aSolved - bSolved;
      return new Date(aRow.dueAt).getTime() - new Date(bRow.dueAt).getTime();
    });
    return rows;
  }, []);

  return (
    <div className={styles.landingAssignOuter} role="img" aria-label={ariaLabel}>
      <ul className={a.list}>
        {assignShowRowsSorted.map((row) => {
          const due = new Date(row.dueAt);
          const now = Date.now();
          const daysLeft = Math.min(10, Math.max(0, Math.ceil((due.getTime() - now) / (24 * 3600 * 1000))));
          const isLate = due.getTime() < now;
          const dueTone = dueBadgeTone(isLate, daysLeft);
          const platform = t(row.platformKey);
          return (
            <li
              key={row.titleKey}
              className={buildCls(a.row, isLate && a.rowPastDue, isLate && styles.landingAssignPastDue)}
            >
              <div className={a.link}>
                <div className={a.head}>
                  <div className={a.headMain}>
                    <div className={a.titleRow}>
                      <span className={a.title}>
                        <Icon name="book" size={16} className={a.titleIcon} />
                        <span className={styles.psProblemTitle}>{t(row.titleKey)}</span>
                      </span>
                      <div className={a.titleNear}>
                        <Badge tone="neutral" chipIndex={1}>
                          {platform}
                        </Badge>
                        <DifficultyBadge platform={platform} difficulty={t(row.difficultyKey)} />
                      </div>
                    </div>
                  </div>
                  <div className={a.headRight}>
                    <div className={a.topRight}>
                      <Badge tone={dueTone}>{isLate ? t("assignment.list.late") : `D-${daysLeft}`}</Badge>
                      <Badge tone={row.solved ? "success" : "danger"}>
                        {row.solved ? t("assignment.detail.solvedBadge") : t("assignment.detail.unsolvedBadge")}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function landingEscapeMdPlain(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function landingDiffEscapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Shiki `codeToHtml` 결과에서 `<code>` 안쪽만 꺼내 diff 한 줄에 넣습니다. */
function landingShikiExtractInline(html: string, emptyLine: boolean): string {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (match === null) return emptyLine ? "&nbsp;" : "";
  return emptyLine ? "&nbsp;" : match[1];
}

function MiniDiffReviewCommentCard(props: {
  avatar: ReactNode;
  author: string;
  atIso: string;
  lineRef: string;
  subHeadOverride?: string;
  markdown: string;
  replyCta?: string;
  onReplyClick?: () => void;
  replyComposer?: ReactNode;
  replyList?: ReactNode;
}) {
  const { locale } = useI18n();
  const sub =
    props.subHeadOverride !== undefined && props.subHeadOverride.trim().length > 0
      ? props.subHeadOverride.trim()
      : props.lineRef;
  return (
    <article className={ccStyles.card}>
      <div className={ccStyles.row}>
        {props.avatar}
        <div className={ccStyles.body}>
          <div className={ccStyles.headRow}>
            <strong className={ccStyles.author}>{props.author}</strong>
            <span className={ccStyles.time}>{formatDateTime(props.atIso, locale)}</span>
          </div>
          <div className={ccStyles.subHead}>{sub}</div>
          <div className={ccStyles.markdownWrap}>
            <MarkdownPreview content={props.markdown} />
          </div>
        </div>
      </div>
      {props.replyList ?? null}
      {props.replyComposer ?? null}
      {props.replyCta !== undefined && props.replyCta.length > 0 ? (
        <div className={ccStyles.replyFooter}>
          <button
            type="button"
            className={ccStyles.replyOpenBtn}
            onClick={props.onReplyClick}
            tabIndex={props.onReplyClick ? 0 : -1}
          >
            {props.replyCta}
          </button>
        </div>
      ) : null}
    </article>
  );
}

type LandingUserDiffThread = {
  id: string;
  insertAfterRowIdx: number;
  fromIdx: number;
  toIdx: number;
  body: string;
  createdAt: number;
};

type LandingMinjiReply = { id: string; body: string; createdAt: number };

type LandingComposerState = { from: number; to: number; draft: string; tab: "write" | "preview" };

function landingReviewNewLineRange(fromIdx: number, toIdx: number): { start: number; end: number } {
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const newNums: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const r = LANDING_DIFF_CODE_ROWS[i];
    if (r.newNum != null) newNums.push(r.newNum);
  }
  if (newNums.length === 0) return { start: lo + 1, end: hi + 1 };
  return { start: Math.min(...newNums), end: Math.max(...newNums) };
}

function MiniLandingInteractiveDiff({ tableAriaLabel }: { tableAriaLabel: string }) {
  const { locale, t } = useI18n();
  const d = diffStyles;
  const { aiCommentVisible } = useLandingReviewAiMock();

  const [lineHtmlMap, setLineHtmlMap] = useState<Record<number, string>>({});
  const [themeEpoch, setThemeEpoch] = useState(0);

  /** 제출 diff와 동일: + mousedown 앵커 → 행 mouseenter로 끝 줄 갱신 → window mouseup으로 확정 */
  const [dragAnchorIdx, setDragAnchorIdx] = useState<number | null>(null);
  const [dragFocusIdx, setDragFocusIdx] = useState<number | null>(null);
  const [composer, setComposer] = useState<LandingComposerState | null>(null);
  const [userThreads, setUserThreads] = useState<LandingUserDiffThread[]>([]);
  const [minjiReplies, setMinjiReplies] = useState<LandingMinjiReply[]>([]);
  const [minjiReplyOpen, setMinjiReplyOpen] = useState(false);
  const [minjiReplyDraft, setMinjiReplyDraft] = useState("");

  const dragRange = useMemo(() => {
    if (dragAnchorIdx === null || dragFocusIdx === null) return null;
    return {
      a: Math.min(dragAnchorIdx, dragFocusIdx),
      b: Math.max(dragAnchorIdx, dragFocusIdx),
    };
  }, [dragAnchorIdx, dragFocusIdx]);

  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setThemeEpoch((n) => n + 1));
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const theme = document.documentElement.dataset.theme === "dark" ? "github-dark" : "github-light";
    const lang = resolveShikiLanguage("typescript");
    const contents = LANDING_DIFF_CODE_ROWS.map((row) => t(row.textKey));
    const blockMask = computeJsTsBlockCommentLineMask(contents);

    void Promise.all(
      LANDING_DIFF_CODE_ROWS.map(async (_row, idx) => {
        const line = contents[idx] ?? "";
        const useBlockCommentStyle = blockMask[idx] === true;
        if (useBlockCommentStyle) {
          const inner =
            line.length === 0 ? "&nbsp;" : `<span class="${d.blockCommentLine}">${landingDiffEscapeHtml(line)}</span>`;
          return [idx, inner] as const;
        }
        const html = await codeToHtml(line.length > 0 ? line : " ", { lang, theme });
        return [idx, landingShikiExtractInline(html, line.length === 0)] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setLineHtmlMap(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setLineHtmlMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [d.blockCommentLine, t, locale, themeEpoch]);

  useEffect(() => {
    if (dragAnchorIdx === null) return;
    const onWindowMouseUp = () => {
      if (dragFocusIdx === null) {
        setDragAnchorIdx(null);
        return;
      }
      const lo = Math.min(dragAnchorIdx, dragFocusIdx);
      const hi = Math.max(dragAnchorIdx, dragFocusIdx);
      setComposer({ from: lo, to: hi, draft: "", tab: "write" });
      setDragAnchorIdx(null);
      setDragFocusIdx(null);
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, [dragAnchorIdx, dragFocusIdx]);

  const submitComposer = useCallback(() => {
    if (!composer) return;
    const body = composer.draft.trim();
    if (body.length === 0) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `thr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const insertAfterRowIdx = Math.max(composer.from, composer.to);
    setUserThreads((prev) => [
      ...prev,
      {
        id,
        insertAfterRowIdx,
        fromIdx: composer.from,
        toIdx: composer.to,
        body,
        createdAt: Date.now(),
      },
    ]);
    setComposer(null);
  }, [composer]);

  const cancelComposer = useCallback(() => setComposer(null), []);

  const submitMinjiReply = useCallback(() => {
    const body = minjiReplyDraft.trim();
    if (body.length === 0) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rep-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMinjiReplies((prev) => [...prev, { id, body, createdAt: Date.now() }]);
    setMinjiReplyDraft("");
    setMinjiReplyOpen(false);
  }, [minjiReplyDraft]);

  const gutterAria = t("landing.mockGutterAria");

  const threadsAfterRow = (rowIdx: number) => {
    const nodes: ReactNode[] = [];
    if (rowIdx === LANDING_MINJI_THREAD_AFTER_ROW) {
      nodes.push(
        <tr key="minji-thread" className={d.reviewRow}>
          <td colSpan={4} className={d.reviewCell}>
            <div className={d.reviewBox}>
              <MiniDiffReviewCommentCard
                avatar={
                  <div className={ccStyles.avatarFallback} aria-hidden>
                    {t("landing.mockDiffAvatarLetter")}
                  </div>
                }
                author={t("landing.mockDiffAuthor1")}
                atIso={t("landing.mockDiffCommentAtIso")}
                lineRef={t("landing.mockDiffLineRef")}
                markdown={t("landing.mockDiffBody1")}
                replyCta={t("landing.mockCommentReplyCta")}
                onReplyClick={() => setMinjiReplyOpen((v) => !v)}
                replyList={
                  minjiReplies.length > 0 ? (
                    <div className={ccStyles.replies}>
                      {minjiReplies.map((r) => (
                        <div key={r.id} className={ccStyles.replyRow}>
                          <div className={ccStyles.avatarFallback} aria-hidden>
                            {t("landing.mockYourAvatarLetter")}
                          </div>
                          <div className={ccStyles.replyBody}>
                            <div className={ccStyles.headRow}>
                              <strong className={ccStyles.author}>{t("landing.mockYourNickname")}</strong>
                              <span className={ccStyles.time}>{formatDateTime(new Date(r.createdAt).toISOString(), locale)}</span>
                            </div>
                            <div className={ccStyles.markdownWrap}>
                              <MarkdownPreview content={landingEscapeMdPlain(r.body)} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
                replyComposer={
                  minjiReplyOpen ? (
                    <div className={ccStyles.replyForm}>
                      <textarea
                        className={ccStyles.replyTextarea}
                        rows={3}
                        value={minjiReplyDraft}
                        onChange={(ev) => setMinjiReplyDraft(ev.target.value)}
                        placeholder={t("submission.diff.commentPlaceholder")}
                        aria-label={t("submission.diff.commentPlaceholder")}
                      />
                      <div className={ccStyles.replyActions}>
                        <button
                          type="button"
                          className={ccStyles.replyCancelBtn}
                          onClick={() => {
                            setMinjiReplyOpen(false);
                            setMinjiReplyDraft("");
                          }}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className={ccStyles.replySubmitBtn}
                          disabled={minjiReplyDraft.trim().length === 0}
                          onClick={submitMinjiReply}
                        >
                          {t("submission.diff.commentSubmit")}
                        </button>
                      </div>
                    </div>
                  ) : null
                }
              />
            </div>
          </td>
        </tr>,
      );
    }

    const hereUser = userThreads.filter((u) => u.insertAfterRowIdx === rowIdx).sort((a, b) => a.createdAt - b.createdAt);
    for (const ut of hereUser) {
      nodes.push(
        <tr key={ut.id} className={d.reviewRow}>
          <td colSpan={4} className={d.reviewCell}>
            <div className={d.reviewBox}>
              <MiniDiffReviewCommentCard
                avatar={
                  <div className={ccStyles.avatarFallback} aria-hidden>
                    {t("landing.mockYourAvatarLetter")}
                  </div>
                }
                author={t("landing.mockYourNickname")}
                atIso={new Date(ut.createdAt).toISOString()}
                lineRef={formatLandingDiffLineRef(locale, ut.fromIdx, ut.toIdx)}
                markdown={landingEscapeMdPlain(ut.body)}
              />
            </div>
          </td>
        </tr>,
      );
    }

    if (rowIdx === LANDING_AI_THREAD_AFTER_ROW && aiCommentVisible) {
      nodes.push(
        <tr key="ai-thread" className={d.reviewRow}>
          <td colSpan={4} className={d.reviewCell}>
            <div className={d.reviewBox}>
              <MiniDiffReviewCommentCard
                avatar={
                  <UserAvatar
                    nickname={t("landing.mockAiCommentAuthor")}
                    imageUrl={AI_TUTOR_PROFILE_IMAGE_URL}
                    size={36}
                  />
                }
                author={t("landing.mockAiCommentAuthor")}
                atIso={t("landing.mockAiCommentAtIso")}
                lineRef=""
                subHeadOverride={t("landing.mockAiCommentSubhead")}
                markdown={t("landing.mockAiCommentBody")}
              />
            </div>
          </td>
        </tr>,
      );
    }

    return nodes;
  };

  const inner = (
    <div className={buildCls(d.tableWrap, dragAnchorIdx !== null && d.dragging)}>
      <span className={styles.srOnly}>{gutterAria}</span>
      <table className={d.table} role="table" aria-label={tableAriaLabel}>
        <tbody>
          {LANDING_DIFF_CODE_ROWS.map((row, idx) => {
            const canComment = row.newNum != null;
            const rowClass =
              row.kind === "add" ? d.addRow : row.kind === "remove" ? d.removeRow : d.contextRow;
            const inRange =
              (dragRange !== null && idx >= dragRange.a && idx <= dragRange.b) ||
              (composer !== null &&
                idx >= Math.min(composer.from, composer.to) &&
                idx <= Math.max(composer.from, composer.to));
            const oldStr = row.oldNum == null ? "" : String(row.oldNum);
            const newStr = row.newNum == null ? "" : String(row.newNum);
            return (
              <Fragment key={`code-${idx}`}>
                <tr
                  className={buildCls(d.diffRow, rowClass, inRange && d.rangeRow)}
                  data-landing-code-idx={idx}
                  onMouseEnter={() => {
                    if (!canComment || dragAnchorIdx === null) return;
                    setDragFocusIdx(idx);
                  }}
                >
                  <td className={d.iconCell}>
                    {canComment ? (
                      <InlineAddButton
                        className={d.inlineAddBtn}
                        type="button"
                        aria-label={t("submission.diff.addComment")}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          setComposer(null);
                          setDragAnchorIdx(idx);
                          setDragFocusIdx(idx);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setComposer({ from: idx, to: idx, draft: "", tab: "write" });
                        }}
                      />
                    ) : null}
                  </td>
                  <td className={d.lineCell}>{oldStr}</td>
                  <td className={d.lineCell}>{newStr}</td>
                  <td className={d.codeCell}>
                    <span className={d.codeSign}>{row.sign}</span>
                    <span
                      className={d.codeTokens}
                      dangerouslySetInnerHTML={{
                        __html: lineHtmlMap[idx] ?? landingDiffEscapeHtml(t(row.textKey)),
                      }}
                    />
                  </td>
                </tr>
                {threadsAfterRow(idx)}
                {composer !== null && idx === Math.max(composer.from, composer.to) ? (
                  <tr key="landing-diff-composer" className={d.formRow}>
                    <td colSpan={4} className={d.formCell}>
                      <div className={d.form} role="dialog" aria-labelledby="landing-diff-composer-label">
                        <div className={d.commentBox}>
                          <div id="landing-diff-composer-label" className={d.commentHead}>
                            {t(
                              "submission.diff.commentTitle",
                              landingReviewNewLineRange(composer.from, composer.to),
                            )}
                          </div>
                          <div className={d.commentTabs}>
                            <button
                              type="button"
                              className={composer.tab === "write" ? d.commentTabActive : d.commentTab}
                              onClick={() => setComposer((c) => (c ? { ...c, tab: "write" } : c))}
                            >
                              {t("submission.diff.write")}
                            </button>
                            <button
                              type="button"
                              className={composer.tab === "preview" ? d.commentTabActive : d.commentTab}
                              onClick={() => setComposer((c) => (c ? { ...c, tab: "preview" } : c))}
                            >
                              {t("submission.diff.preview")}
                            </button>
                          </div>
                          {composer.tab === "write" ? (
                            <textarea
                              className={d.textarea}
                              rows={6}
                              value={composer.draft}
                              onChange={(ev) => setComposer((c) => (c ? { ...c, draft: ev.target.value } : c))}
                              placeholder={t("submission.diff.commentPlaceholder")}
                              aria-label={t("submission.diff.commentPlaceholder")}
                            />
                          ) : (
                            <div className={d.previewArea}>
                              {composer.draft.trim().length > 0 ? (
                                <MarkdownPreview content={composer.draft} />
                              ) : (
                                t("submission.diff.previewEmpty")
                              )}
                            </div>
                          )}
                          <div className={d.formActions}>
                            <Button type="button" variant="secondary" onClick={cancelComposer}>
                              {t("common.cancel")}
                            </Button>
                            <Button
                              type="button"
                              variant="primary"
                              disabled={composer.draft.trim().length === 0}
                              onClick={submitComposer}
                            >
                              {t("submission.diff.commentSubmit")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return <div className={styles.landingDiffOuter}>{inner}</div>;
}

/** 랜딩 피처 밴드 제목 아래에 붙는 AI 피드백 CTA(실제 제출 화면과 동일한 secondary·스파클). */
export function MiniMergedCodeReviewAiTrigger() {
  const { t } = useI18n();
  const { aiCommentVisible, aiLoading, requestAiFeedback } = useLandingReviewAiMock();
  return (
    <>
      <div className={styles.mergedReviewToolbar}>
        <Button
          type="button"
          variant="secondary"
          loading={aiLoading}
          disabled={aiCommentVisible}
          onClick={requestAiFeedback}
          leftIcon={<Icon name="sparkles" size={14} aria-hidden />}
        >
          {aiLoading ? t("landing.mockAiReviewLoading") : t("landing.mockAiReviewButton")}
        </Button>
      </div>
      <p className={styles.mergedReviewHint}>{t("landing.mockAiReviewHint")}</p>
    </>
  );
}

export function MiniMergedCodeReviewAi({
  ariaLabel,
  omitAiTrigger,
}: {
  ariaLabel: string;
  /** true면 CTA·힌트는 피처 밴드 텍스트 열(`FeatureBand`의 `textFooter`)로만 렌더합니다. */
  omitAiTrigger?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className={styles.mergedReviewRoot} role="region" aria-label={ariaLabel}>
      {omitAiTrigger ? null : <MiniMergedCodeReviewAiTrigger />}
      <MiniLandingInteractiveDiff tableAriaLabel={t("landing.mockupReviewAria")} />
    </div>
  );
}

export function MiniAiPanel({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();
  const bullets = [t("landing.mockAiFeedback1"), t("landing.mockAiFeedback2"), t("landing.mockAiFeedback3")];

  return (
    <div className={styles.aiPanel} role="img" aria-label={ariaLabel}>
      <div className={styles.aiHead}>
        <Icon name="sparkles" size={18} />
        <span>{t("submission.detail.aiFeedback")}</span>
      </div>
      <ul className={styles.aiList}>
        {bullets.map((line) => (
          <li key={line} className={styles.aiListItem}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MiniCohortReportShowcase({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();
  const s = cohortStyles;

  const { included, submissions, titlesBySubmissionId, reportMarkdown } = useMemo(() => {
    const { js, py } = LANDING_COHORT_IDS;
    const included = [
      {
        submissionId: js,
        versionNo: 4,
        authorUserId: "landing-mock-user-js",
        authorNickname: t("landing.mockCohortAuthorJs"),
        title: t("landing.mockCohortSubJsTitle"),
        authorProfileImageUrl: "https://picsum.photos/seed/psstudio-cohort-js/96/96",
      },
      {
        submissionId: py,
        versionNo: 7,
        authorUserId: "landing-mock-user-py",
        authorNickname: t("landing.mockCohortAuthorPy"),
        title: t("landing.mockCohortSubPyTitle"),
        authorProfileImageUrl: "https://picsum.photos/seed/psstudio-cohort-py/96/96",
      },
    ];
    const setup = t("landing.mockCohortRoleSetup");
    const bfs = t("landing.mockCohortRoleBfs");
    const ret = t("landing.mockCohortRoleReturn");
    const submissions: CohortSubmissionArtifact[] = [
      {
        submissionId: js,
        code: t("landing.mockCompareRightCode"),
        language: "typescript",
        regions: [
          { roleId: "cohort-setup", roleLabel: setup, startLine: 1, endLine: 4 },
          { roleId: "cohort-bfs", roleLabel: bfs, startLine: 5, endLine: 14 },
          { roleId: "cohort-return", roleLabel: ret, startLine: 15, endLine: 16 },
        ],
      },
      {
        submissionId: py,
        code: t("landing.mockCompareLeftCode"),
        language: "python",
        regions: [
          { roleId: "cohort-setup", roleLabel: setup, startLine: 1, endLine: 4 },
          { roleId: "cohort-bfs", roleLabel: bfs, startLine: 5, endLine: 12 },
          { roleId: "cohort-return", roleLabel: ret, startLine: 13, endLine: 13 },
        ],
      },
    ];
    const titlesBySubmissionId = new Map(
      included.map((row) => [row.submissionId, { title: row.title, versionNo: row.versionNo }]),
    );
    return { included, submissions, titlesBySubmissionId, reportMarkdown: t("landing.mockCohortMarkdown") };
  }, [t]);

  return (
    <div className={buildCls(s.root, styles.landingCohortOuter)} role="img" aria-label={ariaLabel}>
      <section className={s.codeSection} aria-labelledby="landing-cohort-report">
        <h2 id="landing-cohort-report" className={s.codeSectionTitle}>
          {t("landing.mockCohortCardTitle")}
        </h2>
        <p className={s.sub}>{t("landing.mockCohortCardMeta")}</p>
        <CohortReportBody
          reportMarkdown={reportMarkdown}
          groupId={LANDING_COHORT_IDS.groupId}
          assignmentId={LANDING_COHORT_IDS.assignmentId}
          included={included}
          submissionLinks={false}
        />
      </section>

      <section className={s.codeSection} aria-labelledby="landing-cohort-code">
        <h2 id="landing-cohort-code" className={s.codeSectionTitle}>
          {t("assignment.cohortPage.codeHeading")}
        </h2>
        <CohortCodeColumns
          submissions={submissions}
          titlesBySubmissionId={titlesBySubmissionId}
          layout="landingPeek"
        />
      </section>
    </div>
  );
}

export function RoleGlyph({ icon }: { icon: IconName }) {
  return (
    <div className={styles.roleGlyph}>
      <Icon name={icon} size={26} />
    </div>
  );
}

export function FeatureBand({
  reverse,
  mock,
  title,
  lead,
  textFooter,
  wideCalendarMock,
}: {
  reverse?: boolean;
  mock: ReactNode;
  title: ReactNode;
  lead: string;
  /** 제목·리드 아래에 렌더(예: AI 피드백 CTA). */
  textFooter?: ReactNode;
  /** true면 캘린더 목 영역이 가로로 최대한 넓어지도록 레이아웃을 조정합니다. */
  wideCalendarMock?: boolean;
}) {
  return (
    <div
      className={buildCls(
        styles.featureBand,
        reverse ? styles.featureBandReverse : "",
        wideCalendarMock ? styles.featureBandCalendarMock : "",
      )}
    >
      <div className={styles.featureMock}>{mock}</div>
      <div className={styles.featureText}>
        <h3 className={styles.featureTitle}>{title}</h3>
        {lead.trim().length > 0 ? <p className={styles.featureLead}>{lead}</p> : null}
        {textFooter ?? null}
      </div>
    </div>
  );
}

export function LandingFlowStrip({
  ariaLabel,
  steps,
}: {
  ariaLabel: string;
  steps: { step: string; icon: IconName; label: string }[];
}) {
  return (
    <ol className={styles.flowStrip} aria-label={ariaLabel}>
      {steps.map((s) => (
        <li key={s.step} className={styles.flowChip}>
          <span className={styles.flowNum}>{s.step}</span>
          <Icon name={s.icon} size={18} />
          <span className={styles.flowLbl}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
