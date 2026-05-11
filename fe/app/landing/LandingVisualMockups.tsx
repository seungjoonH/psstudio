"use client";

// 랜딩용 예시 UI 더미와 장식 이미지를 렌더링합니다.
import type { ReactNode } from "react";
import assignStyles from "../../src/assignments/AssignmentList.module.css";
import { useI18n } from "../../src/i18n/I18nProvider";
import { buildCls } from "../../src/lib/buildCls";
import { dueBadgeTone } from "../../src/lib/dueBadgeTone";
import ccStyles from "../../src/ui/comments/CommentCard.module.css";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { DifficultyBadge } from "../../src/ui/DifficultyBadge";
import type { IconName } from "../../src/ui/Icon";
import { Icon } from "../../src/ui/Icon";
import { InlineAddButton } from "../../src/ui/InlineAddButton";
import { SegmentedControl } from "../../src/ui/SegmentedControl";
import { UserAvatar } from "../../src/ui/UserAvatar";
import calStyles from "../groups/[groupId]/calendar/page.module.css";
import diffStyles from "../groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/diff/DiffViewerClient.module.css";
import homeStyles from "../page.module.css";
import styles from "./LandingVisualMockups.module.css";

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

/** 2026년 5월 월간 그리드용 정적 셀(선행·당월·오늘·과제 칩). */
const MAY_2026_CAL_CELLS: { day: number; outside: boolean; today: boolean; pillKey?: "a" | "b" }[] = [
  { day: 26, outside: true, today: false },
  { day: 27, outside: true, today: false },
  { day: 28, outside: true, today: false },
  { day: 29, outside: true, today: false },
  { day: 30, outside: true, today: false },
  { day: 1, outside: false, today: false },
  { day: 2, outside: false, today: false },
  { day: 3, outside: false, today: false },
  { day: 4, outside: false, today: false },
  { day: 5, outside: false, today: false },
  { day: 6, outside: false, today: false },
  { day: 7, outside: false, today: false },
  { day: 8, outside: false, today: false },
  { day: 9, outside: false, today: false },
  { day: 10, outside: false, today: false },
  { day: 11, outside: false, today: true },
  { day: 12, outside: false, today: false },
  { day: 13, outside: false, today: false },
  { day: 14, outside: false, today: false },
  { day: 15, outside: false, today: false },
  { day: 16, outside: false, today: false, pillKey: "a" },
  { day: 17, outside: false, today: false, pillKey: "b" },
  { day: 18, outside: false, today: false },
  { day: 19, outside: false, today: false },
  { day: 20, outside: false, today: false },
  { day: 21, outside: false, today: false },
  { day: 22, outside: false, today: false },
  { day: 23, outside: false, today: false },
];

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function LandingHeroDecor() {
  return (
    <div className={styles.decorWrap}>
      <img className={styles.decorImg} src="/landing/hero-mesh.svg" alt="" width={420} height={300} />
    </div>
  );
}

export function MiniHomeKanban({ ariaLabel }: { ariaLabel: string }) {
  const { locale, t } = useI18n();
  const h = homeStyles;
  const todoDue = t("landing.mockHomeTodoDueIso");
  const doneAt = t("landing.mockHomeDoneAtIso");
  const todoDays = getDaysLeft(todoDue);
  const todoLate = new Date(todoDue).getTime() < Date.now();

  return (
    <div className={styles.landingHomeOuter} role="img" aria-label={ariaLabel}>
      <div className={h.dashboard}>
        <section className={h.hero} aria-hidden>
          <div>
            <p className={h.heroEyebrow}>{t("home.kanban.eyebrow")}</p>
            <h2 className={h.heroTitle}>{t("home.kanban.title", { nickname: t("landing.mockHomeNickname") })}</h2>
            <p className={h.heroLead}>{t("home.kanban.lead")}</p>
          </div>
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
        </section>

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
                <li>
                  <div className={h.feedRowStatic}>
                    <div className={h.feedMain}>
                      <span className={h.listTitle}>{t("landing.mockHomeTodoTitle")}</span>
                      <span className={h.listMeta}>
                        <Badge tone="neutral">{t("landing.mockHomeTodoGroup")}</Badge>
                        <Badge tone="neutral">{t("landing.mockHomeTodoPlatform")}</Badge>
                      </span>
                      <Badge tone={dueBadgeTone(todoLate, todoDays)} className={h.duePill}>
                        {formatDateTime(todoDue, locale)}
                      </Badge>
                    </div>
                  </div>
                </li>
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
                <li>
                  <div className={h.feedRowStatic}>
                    <div className={h.feedMain}>
                      <span className={h.listTitle}>{t("landing.mockHomeDoneTitle")}</span>
                      <span className={h.listMeta}>
                        <span className={h.listLang}>{t("landing.mockHomeDoneLang")}</span>
                        <span className={h.listTime}>{formatDateTime(doneAt, locale)}</span>
                      </span>
                    </div>
                  </div>
                </li>
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
                  <span className={buildCls(h.viewAllLink, styles.landingFakeLink)}>{t("home.recent.notifications.viewAll")}</span>
                </div>
                <p className={h.cardDesc}>{t("home.kanban.noticeDesc")}</p>
              </div>
            </header>
            <div className={h.columnBody}>
              <ul className={h.list}>
                <li>
                  <div className={h.feedRowStatic}>
                    <UserAvatar nickname={t("landing.mockNotifyActor")} imageUrl="" size={40} className={h.feedAvatar} />
                    <div className={h.feedMain}>
                      <span className={h.notifTitle}>{t("landing.mockNotifyPreviewTitle")}</span>
                      <span className={h.listTime}>{formatDateTime(t("landing.mockNotifyPreviewAtIso"), locale)}</span>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

export function MiniCalendar({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();
  const c = calStyles;

  const pillLabel = (key: "a" | "b") =>
    key === "a" ? t("landing.mockCalAssignment1") : t("landing.mockCalAssignment2");

  return (
    <div className={buildCls(c.calendarCard, styles.landingMiniCal)} role="img" aria-label={ariaLabel}>
      <header className={c.calendarHeader}>
        <div className={c.headerActions}>
          <div className={c.periodNav}>
            <span className={c.iconNavBtn} aria-hidden>
              <Icon name="chevronRight" size={16} className={c.chevronLeft} />
            </span>
            <strong className={c.periodLabel}>{t("landing.mockCalCaption")}</strong>
            <span className={c.iconNavBtn} aria-hidden>
              <Icon name="chevronRight" size={16} />
            </span>
          </div>
          <div className={c.rightActions}>
            <span className={c.todayLink}>{t("groupCalendar.today")}</span>
            <div className={c.viewSegmentWrap}>
              <SegmentedControl
                name="landingCalView"
                defaultValue="month"
                aria-label={t("groupCalendar.viewAria")}
                options={[
                  { value: "week", label: t("groupCalendar.week") },
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

      <div className={buildCls(c.monthGrid, styles.landingMiniCalGrid)}>
        {MAY_2026_CAL_CELLS.map((cell, idx) => (
          <section
            key={`cal-${idx}`}
            className={buildCls(c.dayCell, cell.today ? c.dayCellToday : "", cell.outside ? c.dayCellMuted : "").trim()}
          >
            <div className={c.dayCellHit}>
              <header className={c.dayHead}>
                <span className={buildCls(c.dayNumber, cell.outside ? c.dayNumberMuted : "").trim()}>{cell.day}</span>
              </header>
              <ul className={c.assignmentList}>
                {cell.pillKey ? (
                  <li className={c.assignmentRow}>
                    <span className={c.assignmentPill}>
                      <span className={c.assignmentTitle}>{pillLabel(cell.pillKey)}</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function MiniAssignmentShowcase({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useI18n();
  const a = assignStyles;
  const dueAt = t("landing.mockAssignmentDueIso");
  const due = new Date(dueAt);
  const daysLeft = Math.max(0, Math.ceil((due.getTime() - Date.now()) / (24 * 3600 * 1000)));
  const isLate = due.getTime() < Date.now();
  const dueTone = dueBadgeTone(isLate, daysLeft);

  return (
    <div className={styles.landingAssignOuter} role="img" aria-label={ariaLabel}>
      <ul className={a.list}>
        <li className={buildCls(a.row, isLate ? a.rowPastDue : undefined)}>
          <div className={a.link}>
            <div className={a.head}>
              <div className={a.headMain}>
                <div className={a.titleRow}>
                  <span className={a.title}>
                    <Icon name="book" size={16} className={a.titleIcon} />
                    {t("landing.mockAssignmentCardTitle")}
                  </span>
                  <div className={a.titleNear}>
                    <Badge tone="neutral" chipIndex={1}>
                      {t("landing.mockAssignmentPlatform")}
                    </Badge>
                    <DifficultyBadge platform={t("landing.mockAssignmentPlatform")} difficulty={t("landing.mockAssignmentDifficulty")} />
                    <Badge tone="neutral" chipIndex={0}>
                      {t("landing.mockAssignmentGroup")}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className={a.headRight}>
                <div className={a.topRight}>
                  <Badge tone={dueTone}>{isLate ? t("assignment.list.late") : `D-${daysLeft}`}</Badge>
                  <Badge tone="danger">{t("assignment.list.unsolved")}</Badge>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}

export function MiniDiffReview({ ariaLabel }: { ariaLabel: string }) {
  const { locale, t } = useI18n();
  const d = diffStyles;

  return (
    <div className={styles.landingDiffOuter} role="img" aria-label={ariaLabel}>
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
            <tr className={buildCls(d.diffRow, d.addRow)}>
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
                  <article className={ccStyles.card}>
                    <div className={ccStyles.row}>
                      <div className={ccStyles.avatarFallback} aria-hidden>
                        {t("landing.mockDiffAvatarLetter")}
                      </div>
                      <div className={ccStyles.body}>
                        <div className={ccStyles.headRow}>
                          <strong className={ccStyles.author}>{t("landing.mockDiffAuthor1")}</strong>
                          <span className={ccStyles.time}>{formatDateTime(t("landing.mockDiffCommentAtIso"), locale)}</span>
                        </div>
                        <div className={ccStyles.subHead}>{t("landing.mockDiffLineRef")}</div>
                        <div className={ccStyles.markdownWrap}>
                          <p className={styles.landingCommentPlain}>{t("landing.mockDiffBody1")}</p>
                        </div>
                      </div>
                    </div>
                    <div className={ccStyles.replyFooter}>
                      <button type="button" className={ccStyles.replyOpenBtn} tabIndex={-1}>
                        {t("landing.mockCommentReplyCta")}
                      </button>
                    </div>
                  </article>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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

export function MiniNotifyList({ ariaLabel }: { ariaLabel: string }) {
  const { locale, t } = useI18n();
  const h = homeStyles;
  const items = [
    {
      title: t("landing.mockNotify1Title"),
      when: formatDateTime(t("landing.mockNotify1AtIso"), locale),
      actor: t("landing.mockNotify1Actor"),
    },
    {
      title: t("landing.mockNotify2Title"),
      when: formatDateTime(t("landing.mockNotify2AtIso"), locale),
      actor: t("landing.mockNotify2Actor"),
    },
    {
      title: t("landing.mockNotify3Title"),
      when: formatDateTime(t("landing.mockNotify3AtIso"), locale),
      actor: t("landing.mockNotify3Actor"),
    },
  ];

  return (
    <div className={styles.landingNotifyOuter} role="img" aria-label={ariaLabel}>
      <ul className={h.list}>
        {items.map((item) => (
          <li key={item.title}>
            <div className={h.feedRowStatic}>
              <UserAvatar nickname={item.actor} imageUrl="" size={40} className={h.feedAvatar} />
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
  title: string;
  lead: string;
}) {
  return (
    <div className={buildCls(styles.featureBand, reverse ? styles.featureBandReverse : "")}>
      <div className={styles.featureMock}>{mock}</div>
      <div className={styles.featureText}>
        <h3 className={styles.featureTitle}>{title}</h3>
        <p className={styles.featureLead}>{lead}</p>
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
