"use client";

// 랜딩용 예시 UI 더미와 장식 이미지를 렌더링합니다.
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import assignStyles from "../../src/assignments/AssignmentList.module.css";
import type { CohortSubmissionArtifact } from "../../src/assignments/server";
import { useI18n } from "../../src/i18n/I18nProvider";
import { buildCls } from "../../src/lib/buildCls";
import { dueBadgeTone } from "../../src/lib/dueBadgeTone";
import cohortStyles from "../groups/[groupId]/assignments/[assignmentId]/cohort/CohortAnalysisClient.module.css";
import calStyles from "../groups/[groupId]/calendar/page.module.css";
import diffStyles from "../groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/diff/DiffViewerClient.module.css";
import groupsExploreStyles from "../groups/explore/page.module.css";
import homeStyles from "../page.module.css";
import ccStyles from "../../src/ui/comments/CommentCard.module.css";
import { AssignmentNotificationGlyph } from "../../src/ui/AssignmentNotificationGlyph";
import { DeadlineSoonNotificationGlyph } from "../../src/ui/DeadlineSoonNotificationGlyph";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { DifficultyBadge } from "../../src/ui/DifficultyBadge";
import type { IconName } from "../../src/ui/Icon";
import { Icon } from "../../src/ui/Icon";
import { InlineAddButton } from "../../src/ui/InlineAddButton";
import { CohortCodeColumns } from "../../src/ui/cohort/CohortCodeColumns";
import { CohortReportBody } from "../../src/ui/cohort/CohortReportBody";
import { MarkdownPreview } from "../../src/ui/MarkdownPreview";
import { SegmentedControl } from "../../src/ui/SegmentedControl";
import { UserAvatar } from "../../src/ui/UserAvatar";
import styles from "./LandingVisualMockups.module.css";

/** 랜딩 집단 분석 목업에서 리포트 칩·코드 열에 쓰는 고정 ID입니다. */
const LANDING_COHORT_IDS = {
  groupId: "00000000-0000-4000-8000-00000000c0a1",
  assignmentId: "00000000-0000-4000-8000-00000000c0a2",
  js: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  py: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
} as const;

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getDaysLeft(dueAt: string): number {
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  return Math.max(0, Math.ceil((due - now) / (24 * 60 * 60 * 1000)));
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

type HeroNotifyKind = "assignment" | "user" | "deadline";

export function MiniNotifyList({
  ariaLabel,
  maxItems,
  compact,
}: {
  ariaLabel: string;
  maxItems?: number;
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const h = homeStyles;
  const rows: { kind: HeroNotifyKind; title: string; when: string; actor?: string }[] = [
    {
      kind: "assignment",
      title: t("landing.mockNotifyAssignCreatedTitle"),
      when: formatDateTime(t("landing.mockNotifyAssignCreatedAtIso"), locale),
    },
    {
      kind: "user",
      title: t("landing.mockNotify1Title"),
      when: formatDateTime(t("landing.mockNotify1AtIso"), locale),
      actor: t("landing.mockNotify1Actor"),
    },
    {
      kind: "deadline",
      title: t("landing.mockNotify2Title"),
      when: formatDateTime(t("landing.mockNotify2AtIso"), locale),
    },
    {
      kind: "user",
      title: t("landing.mockNotify3Title"),
      when: formatDateTime(t("landing.mockNotify3AtIso"), locale),
      actor: t("landing.mockNotify3Actor"),
    },
  ];
  const shown = maxItems !== undefined ? rows.slice(0, maxItems) : rows;

  return (
    <div
      className={compact ? styles.landingNotifyCompact : styles.landingNotifyOuter}
      {...(compact ? { "aria-hidden": true } : { role: "img", "aria-label": ariaLabel })}
    >
      <ul className={h.list}>
        {shown.map((item, idx) => (
          <li key={`${idx}-${item.kind}`}>
            <div className={h.feedRowStatic}>
              {item.kind === "assignment" ? (
                <AssignmentNotificationGlyph className={h.feedAvatar} />
              ) : item.kind === "deadline" ? (
                <DeadlineSoonNotificationGlyph className={h.feedAvatar} />
              ) : (
                <UserAvatar nickname={item.actor ?? ""} imageUrl="" size={40} className={h.feedAvatar} />
              )}
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
    algoKey: "landing.mockKanbanTodo3Algo",
    dueIsoKey: "landing.mockKanbanTodo3DueIso",
    solved: false,
  },
  {
    titleKey: "landing.mockKanbanTodo4Title",
    groupKey: "landing.mockKanbanTodo4Group",
    platformKey: "landing.mockKanbanTodo4Platform",
    algoKey: "landing.mockKanbanTodo4Algo",
    dueIsoKey: "landing.mockKanbanTodo4DueIso",
    solved: false,
  },
  {
    titleKey: "landing.mockKanbanTodo1Title",
    groupKey: "landing.mockKanbanTodo1Group",
    platformKey: "landing.mockKanbanTodo1Platform",
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

        <section className={buildCls(h.board, styles.landingHomeBoard)} aria-hidden>
          <article className={buildCls(h.column, styles.landingHomeColumn)}>
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
                  const todoDays = getDaysLeft(dueAt);
                  const todoLate = new Date(dueAt).getTime() < Date.now();
                  return (
                    <li key={row.titleKey}>
                      <div className={h.feedRowStatic}>
                        <div className={h.feedMain}>
                          <span className={buildCls(h.listTitle, styles.psProblemTitle)}>{t(row.titleKey)}</span>
                          <span className={h.listMeta}>
                            <Badge tone="neutral">{t(row.groupKey)}</Badge>
                            <Badge tone="neutral">{t(row.platformKey)}</Badge>
                            <Badge tone="neutral">{t(row.algoKey)}</Badge>
                          </span>
                          <span className={h.listMeta}>
                            <Badge tone={dueBadgeTone(todoLate, todoDays)} className={h.duePill}>
                              {todoLate ? t("assignment.list.late") : formatDateTime(dueAt, locale)}
                            </Badge>
                            <Badge tone={row.solved ? "success" : "danger"}>
                              {row.solved ? t("assignment.detail.solvedBadge") : t("assignment.detail.unsolvedBadge")}
                            </Badge>
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>

          <article className={buildCls(h.column, styles.landingHomeColumn)}>
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
                          <span className={h.listLang}>{t(row.langKey)}</span>
                          <span className={h.listTime}>{formatDateTime(t(row.atIsoKey), locale)}</span>
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className={buildCls(h.column, styles.landingHomeColumn)}>
            <header className={h.columnHead}>
              <span className={buildCls(h.cardIcon, h.noticeIcon)} aria-hidden>
                <Icon name="mail" size={16} />
              </span>
              <div className={h.columnHeadBody}>
                <div className={h.columnHeadTop}>
                  <h3 className={h.cardTitle}>{t("home.recent.notifications.title")}</h3>
                  <span className={buildCls(h.viewAllLink, styles.landingFakeLink)} tabIndex={-1} aria-hidden>
                    {t("home.recent.notifications.viewAll")}
                  </span>
                </div>
                <p className={h.cardDesc}>{t("home.kanban.noticeDesc")}</p>
              </div>
            </header>
            <div className={h.columnBody}>
              <MiniNotifyList ariaLabel={t("landing.mockupNotifyPreviewAria")} maxItems={3} compact />
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
  const [calView, setCalView] = useState<"month" | "week">("month");

  const weekCells = useMemo(() => {
    const idx = MAY_2026_CAL.findIndex((cell) => cell.today);
    const start = idx >= 0 ? Math.floor(idx / 7) * 7 : 0;
    return MAY_2026_CAL.slice(start, start + 7);
  }, []);

  const yearMonthCaption = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "long",
      }).format(new Date()),
    [locale],
  );

  const periodCaption = useMemo(() => {
    const loc = locale === "ko" ? "ko-KR" : "en-US";
    if (calView === "month") return yearMonthCaption;
    const a = landingMockMayCellToDate(weekCells[0]!);
    const b = landingMockMayCellToDate(weekCells[6]!);
    const dtf = new Intl.DateTimeFormat(loc, { month: "long", day: "numeric", year: "numeric" });
    return `${dtf.format(a)} – ${dtf.format(b)}`;
  }, [calView, locale, weekCells, yearMonthCaption]);

  const gridCells = calView === "week" ? weekCells : MAY_2026_CAL;
  const gridClass =
    calView === "week"
      ? buildCls(c.weekGrid, styles.landingMiniCalWeekGrid)
      : buildCls(c.monthGrid, styles.landingMiniCalGrid);

  return (
    <div className={buildCls(c.calendarCard, styles.landingMiniCal, styles.landingMiniCalWide)} role="img" aria-label={ariaLabel}>
      <header className={buildCls(c.calendarHeader, styles.landingMiniCalHeader)}>
        <div className={buildCls(c.headerActions, styles.landingMiniCalHeaderActions)}>
          <div className={c.periodNav}>
            <span className={c.iconNavBtn} aria-hidden>
              <Icon name="chevronRight" size={16} className={c.chevronLeft} />
            </span>
            <strong className={buildCls(c.periodLabel, styles.landingMiniCalPeriodLabel)}>{periodCaption}</strong>
            <span className={c.iconNavBtn} aria-hidden>
              <Icon name="chevronRight" size={16} />
            </span>
          </div>
          <div className={buildCls(c.rightActions, styles.landingMiniCalRight)}>
            <span className={c.todayLink}>{t("groupCalendar.today")}</span>
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
            <Button type="button" variant="secondary" leftIcon={<Icon name="filter" size={16} />} tabIndex={-1}>
              {t("assignment.list.filter")}
            </Button>
            <Button type="button" variant="primary" tabIndex={-1}>
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
            key={calView === "week" ? `wk-${cell.day}-${idx}` : `cal-${idx}`}
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
                    <li key={`${idx}-${pillIdx}`} className={buildCls(c.assignmentRow, styles.landingMiniCalAssignmentRow)}>
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
  metaTailKey: string;
  memberCount: number;
  members: { nickname: string; imageUrl: string }[];
  descriptionKey?: string;
};

const LANDING_GROUP_MOCKS: LandingGroupMockRow[] = [
  {
    nameKey: "landing.mockGroup1Name",
    descriptionKey: "landing.mockGroup1Description",
    metaTailKey: "landing.mockGroup1MetaTail",
    memberCount: 4,
    members: [
      { nickname: "윤하", imageUrl: "https://picsum.photos/seed/psstudio-landing-g1-0/96/96" },
      { nickname: "태양", imageUrl: "" },
      { nickname: "서준", imageUrl: "https://picsum.photos/seed/psstudio-landing-g1-2/96/96" },
    ],
  },
  {
    nameKey: "landing.mockGroup2Name",
    metaTailKey: "landing.mockGroup2MetaTail",
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
    metaTailKey: "landing.mockGroup3MetaTail",
    memberCount: 5,
    members: [
      { nickname: "유진", imageUrl: "" },
      { nickname: "시우", imageUrl: "https://picsum.photos/seed/psstudio-landing-g3-1/96/96" },
      { nickname: "다은", imageUrl: "https://picsum.photos/seed/psstudio-landing-g3-2/96/96" },
    ],
  },
  {
    nameKey: "landing.mockGroup4Name",
    metaTailKey: "landing.mockGroup4MetaTail",
    memberCount: 2,
    members: [
      { nickname: "준호", imageUrl: "" },
      { nickname: "수아", imageUrl: "" },
    ],
  },
  {
    nameKey: "landing.mockGroup5Name",
    metaTailKey: "landing.mockGroup5MetaTail",
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
                  {t(row.metaTailKey)}
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

function MiniDiffReviewCommentCard(props: {
  avatar: ReactNode;
  author: string;
  atIso: string;
  lineRef: string;
  markdown: string;
  replyCta: string;
}) {
  const { locale } = useI18n();
  return (
    <article className={ccStyles.card}>
      <div className={ccStyles.row}>
        {props.avatar}
        <div className={ccStyles.body}>
          <div className={ccStyles.headRow}>
            <strong className={ccStyles.author}>{props.author}</strong>
            <span className={ccStyles.time}>{formatDateTime(props.atIso, locale)}</span>
          </div>
          <div className={ccStyles.subHead}>{props.lineRef}</div>
          <div className={ccStyles.markdownWrap}>
            <MarkdownPreview content={props.markdown} />
          </div>
        </div>
      </div>
      <div className={ccStyles.replyFooter}>
        <button type="button" className={ccStyles.replyOpenBtn} tabIndex={-1}>
          {props.replyCta}
        </button>
      </div>
    </article>
  );
}

export function MiniDiffReview({
  ariaLabel,
  embedded,
  withAiFollowUp,
}: {
  ariaLabel: string;
  embedded?: boolean;
  /** true면 AI 댓글을 민지 댓글과 동일하게 diff 테이블 안에 이어 붙입니다. */
  withAiFollowUp?: boolean;
}) {
  const { locale, t } = useI18n();
  const d = diffStyles;

  const inner = (
    <div className={d.tableWrap}>
      <table className={d.table}>
        <tbody>
          <tr className={buildCls(d.diffRow, d.contextRow)}>
            <td className={d.iconCell} />
            <td className={d.lineCell}>6</td>
            <td className={d.lineCell}>6</td>
            <td className={d.codeCell}>
              <span className={d.codeSign}> </span>
              <span className={d.codeTokens}>{t("landing.mockDiffCtx")}</span>
            </td>
          </tr>
          <tr className={buildCls(d.diffRow, d.removeRow)}>
            <td className={d.iconCell} />
            <td className={d.lineCell}>7</td>
            <td className={d.lineCell} />
            <td className={d.codeCell}>
              <span className={d.codeSign}>-</span>
              <span className={d.codeTokens}>{t("landing.mockDiffOld")}</span>
            </td>
          </tr>
          <tr className={buildCls(d.diffRow, d.addRow, d.reviewSpanSingle)}>
            <td className={d.iconCell}>
              <InlineAddButton className={d.inlineAddBtn} tabIndex={-1} aria-hidden />
            </td>
            <td className={d.lineCell} />
            <td className={d.lineCell}>7</td>
            <td className={d.codeCell}>
              <span className={d.codeSign}>+</span>
              <span className={d.codeTokens}>{t("landing.mockDiffNew")}</span>
            </td>
          </tr>
          <tr className={d.reviewRow}>
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
                />
              </div>
            </td>
          </tr>
          {withAiFollowUp ? (
            <>
              <tr className={buildCls(d.diffRow, d.contextRow, d.reviewSpanSingle)}>
                <td className={d.iconCell} />
                <td className={d.lineCell}>8</td>
                <td className={d.lineCell}>8</td>
                <td className={d.codeCell}>
                  <span className={d.codeSign}> </span>
                  <span className={d.codeTokens}>{t("landing.mockDiffPostCtx")}</span>
                </td>
              </tr>
              <tr className={d.reviewRow}>
                <td colSpan={4} className={d.reviewCell}>
                  <div className={d.reviewBox}>
                    <MiniDiffReviewCommentCard
                      avatar={
                        <div className={buildCls(ccStyles.avatarFallback, styles.mergedAiAvatar)} aria-hidden>
                          <Icon name="bot" size={16} />
                        </div>
                      }
                      author={t("landing.mockAiCommentAuthor")}
                      atIso={t("landing.mockAiCommentAtIso")}
                      lineRef={t("landing.mockAiCommentLineRef")}
                      markdown={t("landing.mockAiCommentBody")}
                      replyCta={t("landing.mockCommentReplyCta")}
                    />
                  </div>
                </td>
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return <div className={styles.landingDiffOuter}>{inner}</div>;
  }

  return (
    <div className={styles.landingDiffOuter} role="img" aria-label={ariaLabel}>
      {inner}
    </div>
  );
}

export function MiniMergedCodeReviewAi({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();

  return (
    <div className={styles.mergedReviewRoot} role="img" aria-label={ariaLabel}>
      <div className={styles.mergedReviewToolbar}>
        <Button type="button" variant="primary" tabIndex={-1}>
          {t("landing.mockAiReviewButton")}
        </Button>
      </div>
      <p className={styles.mergedReviewHint}>{t("landing.mockAiReviewHint")}</p>
      <div className={styles.codeCompareGrid} aria-hidden>
        <div className={styles.codeCompareCol}>
          <p className={styles.codeCompareLabel}>{t("landing.mockCompareLeftTitle")}</p>
          <pre className={styles.codeComparePre}>{t("landing.mockCompareLeftCode")}</pre>
        </div>
        <div className={styles.codeCompareCol}>
          <p className={styles.codeCompareLabel}>{t("landing.mockCompareRightTitle")}</p>
          <pre className={styles.codeComparePre}>{t("landing.mockCompareRightCode")}</pre>
        </div>
      </div>
      <MiniDiffReview ariaLabel={t("landing.mockupReviewAria")} embedded withAiFollowUp />
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
}: {
  reverse?: boolean;
  mock: ReactNode;
  title: ReactNode;
  lead: string;
}) {
  return (
    <div className={buildCls(styles.featureBand, reverse ? styles.featureBandReverse : "")}>
      <div className={styles.featureMock}>{mock}</div>
      <div className={styles.featureText}>
        <h3 className={styles.featureTitle}>{title}</h3>
        {lead.trim().length > 0 ? <p className={styles.featureLead}>{lead}</p> : null}
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
