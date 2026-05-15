"use client";

// 홈 화면 대시보드. 로그인 상태에 따라 환영 화면 또는 최근 활동 카드를 표시합니다.
import type { MeResponse } from "@psstudio/shared";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import Link from "next/link";
import type { HomeRecentNotification } from "../src/auth/api.server";
import { formatKstDateTime } from "../src/i18n/formatDateTime";
import { LoginClient } from "./login/LoginClient";
import { useI18n } from "../src/i18n/I18nProvider";
import { buildCls } from "../src/lib/buildCls";
import { dueBadgeTone } from "../src/lib/dueBadgeTone";
import { notificationUsesAssignmentGlyph } from "../src/lib/notificationUsesAssignmentGlyph";
import { notificationActorDisplayName } from "../src/lib/notificationActorDisplayName";
import { useNotificationStream } from "../src/notifications/useNotificationStream";
import { resolveShikiLanguage } from "../src/lib/shikiLanguage";
import { formatAssignmentAlgorithmLabel, formatProblemPlatformLabel } from "../src/assignments/algorithmLabels";
import { AssignmentNotificationGlyph } from "../src/ui/AssignmentNotificationGlyph";
import { DeadlineSoonNotificationGlyph } from "../src/ui/DeadlineSoonNotificationGlyph";
import { Badge } from "../src/ui/Badge";
import { DifficultyBadge } from "../src/ui/DifficultyBadge";
import { Icon } from "../src/ui/Icon";
import { NotificationTitle } from "../src/notifications/NotificationTitle";
import { UserAvatar } from "../src/ui/UserAvatar";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

type RecentSubmission = {
  id: string;
  title: string;
  language: string;
  createdAt: string;
  href: string;
};

type HomeTodoItem = {
  id: string;
  title: string;
  groupName: string;
  platform: string;
  difficulty: string | null;
  algorithms: string[];
  algorithmsHiddenUntilSubmit?: boolean;
  dueAt: string;
  href: string;
};

type Props = {
  me: MeResponse | null;
  loginApiBase: string;
  notifications?: HomeRecentNotification[];
  submissions?: RecentSubmission[];
  /** 히어로「한 일」숫자. 지난 7일 이내 제출 건수(서버 조회·상한 내). */
  submissionCount?: number;
  todoItems?: HomeTodoItem[];
  /** 미제출 과제 전체 개수(히어로 통계). 칸반 todoItems는 최대 4건만 넘깁니다. */
  todoTotal?: number;
};

function getDaysLeft(dueAt: string): number {
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  return Math.max(0, Math.ceil((due - now) / (24 * 60 * 60 * 1000)));
}

export function HomeClient({
  me,
  loginApiBase,
  notifications = [],
  submissions = [],
  submissionCount,
  todoItems = [],
  todoTotal,
}: Props) {
  const { locale, t } = useI18n();
  const router = useRouter();

  useNotificationStream(
    () => {
      router.refresh();
    },
    { enabled: me !== null },
  );

  if (me === null) {
    return <LoginClient apiBase={loginApiBase} />;
  }

  const todoStat = todoTotal ?? todoItems.length;
  const doneStat = submissionCount ?? submissions.length;

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero} aria-labelledby="home-hero-title">
        <div>
          <p className={styles.heroEyebrow}>{t("home.kanban.eyebrow")}</p>
          <h1 id="home-hero-title" className={styles.heroTitle}>
            {t("home.kanban.title", { nickname: me.nickname })}
          </h1>
          <p className={styles.heroLead}>{t("home.kanban.lead")}</p>
        </div>
        <div className={styles.stats} aria-label={t("home.kanban.statsAria")}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{todoStat}</span>
            <span className={styles.statLabel}>{t("home.kanban.todoCount")}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{doneStat}</span>
            <span className={styles.statLabel}>{t("home.kanban.doneCount")}</span>
          </div>
        </div>
      </section>

      <section className={styles.board} aria-label={t("home.kanban.boardAria")}>
        <article className={styles.column} aria-labelledby="home-todo-title">
          <header className={styles.columnHead}>
            <span className={`${styles.cardIcon} ${styles.todoIcon}`} aria-hidden>
              <Icon name="calendar" size={16} />
            </span>
            <div>
              <h2 id="home-todo-title" className={styles.cardTitle}>
                {t("home.kanban.todoTitle")}
              </h2>
              <p className={styles.cardDesc}>{t("home.kanban.todoDesc")}</p>
            </div>
          </header>
          <div className={styles.columnBody}>
            {todoItems.length === 0 ? (
              <p className={styles.cardEmpty}>{t("home.kanban.todoEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {todoItems.map((item) => {
                  const daysLeft = getDaysLeft(item.dueAt);
                  const isLate = new Date(item.dueAt).getTime() < Date.now();
                  const dueLabel = isLate ? t("assignment.list.late") : `D-${daysLeft}`;
                  const algorithms = item.algorithms ?? [];
                  /* 이 열은 미제출 과제만 포함하므로, 과제 목록과 동일 정책이면 `algorithmsHiddenUntilSubmit`이 true일 때 알고리즘 행을 숨깁니다. */
                  const showAlgoRow =
                    algorithms.length > 0 && !(item.algorithmsHiddenUntilSubmit ?? true);
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className={buildCls(styles.feedRow, isLate ? styles.feedRowPastDue : undefined)}
                      >
                        <div className={styles.todoCardRow}>
                          <div className={styles.todoCardMain}>
                            <div className={styles.todoTitleStrip}>
                              <div className={styles.todoTitleLeft}>
                                <span className={styles.kanbanItemTitle}>
                                  <Icon name="task" size={14} className={styles.kanbanItemTitleIcon} aria-hidden />
                                  <span className={styles.kanbanItemTitleText}>{item.title}</span>
                                </span>
                              </div>
                              <span className={styles.todoTitleDue}>
                                <Badge tone={dueBadgeTone(isLate, daysLeft)}>{dueLabel}</Badge>
                              </span>
                            </div>
                            <div className={styles.todoMetaRow}>
                              <span className={styles.todoGroupSlot}>
                                <span className={styles.todoGroupInline} title={item.groupName}>
                                  {item.groupName}
                                </span>
                              </span>
                              <Badge tone="neutral" chipIndex={1}>
                                {formatProblemPlatformLabel(locale, item.platform)}
                              </Badge>
                              <DifficultyBadge platform={item.platform} difficulty={item.difficulty} />
                            </div>
                            {showAlgoRow ? (
                              <div className={styles.todoMetaRow}>
                                {algorithms.map((tag, index) => (
                                  <Badge key={`${item.id}-algo-${tag}-${index}`} tone="neutral">
                                    {formatAssignmentAlgorithmLabel(locale, tag)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </article>

        <article className={styles.column} aria-labelledby="home-done-title">
          <header className={styles.columnHead}>
            <span className={`${styles.cardIcon} ${styles.doneIcon}`} aria-hidden>
              <Icon name="done" size={16} />
            </span>
            <div>
              <h2 id="home-done-title" className={styles.cardTitle}>
                {t("home.kanban.doneTitle")}
              </h2>
              <p className={styles.cardDesc}>{t("home.kanban.doneDesc")}</p>
            </div>
          </header>
          <div className={styles.columnBody}>
            {submissions.length === 0 ? (
              <p className={styles.cardEmpty}>{t("home.recent.submissions.empty")}</p>
            ) : (
              <ul className={styles.list}>
                {submissions.map((s) => (
                  <li key={s.id}>
                    <Link href={s.href} className={styles.feedRow}>
                      <div className={styles.feedMain}>
                        <span className={styles.listTitle}>{s.title}</span>
                        <span className={styles.listMeta}>
                          <Badge tone="neutral">{resolveShikiLanguage(s.language)}</Badge>
                          <span className={styles.listTime}>{formatKstDateTime(s.createdAt, locale)}</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className={styles.column} aria-labelledby="home-notif-title">
          <header className={styles.columnHead}>
            <span className={`${styles.cardIcon} ${styles.noticeIcon}`} aria-hidden>
              <Icon name="mail" size={16} />
            </span>
            <div className={styles.columnHeadBody}>
              <div className={styles.columnHeadTop}>
                <h2 id="home-notif-title" className={styles.cardTitle}>
                  {t("home.recent.notifications.title")}
                </h2>
                <Link href="/notifications" className={styles.viewAllLink}>
                  {t("home.recent.notifications.viewAll")}
                </Link>
              </div>
              <p className={styles.cardDesc}>{t("home.kanban.noticeDesc")}</p>
            </div>
          </header>
          <div className={styles.columnBody}>
            {notifications.length === 0 ? (
              <p className={styles.cardEmpty}>{t("home.recent.notifications.empty")}</p>
            ) : (
              <ul className={styles.list}>
                {notifications.map((n) => {
                  const showActorFace =
                    n.type !== NOTIFICATION_TYPES.ASSIGNMENT_CREATED &&
                    n.type !== NOTIFICATION_TYPES.DEADLINE_SOON;
                  const useAssignmentGlyph = notificationUsesAssignmentGlyph(n.type);
                  const face =
                    n.type === NOTIFICATION_TYPES.DEADLINE_SOON ? (
                      <DeadlineSoonNotificationGlyph className={styles.feedAvatar} />
                    ) : useAssignmentGlyph ? (
                      <AssignmentNotificationGlyph className={styles.feedAvatar} />
                    ) : showActorFace ? (
                      <UserAvatar
                        nickname={notificationActorDisplayName(n)}
                        imageUrl={n.actorProfileImageUrl ?? ""}
                        size={40}
                        className={styles.feedAvatar}
                      />
                    ) : null;
                  const card = (
                    <div className={styles.feedMain}>
                      <NotificationTitle
                        type={n.type}
                        title={n.title}
                        actorNickname={n.actorNickname}
                        className={styles.notifTitle}
                      />
                      <span className={styles.listTime}>{formatKstDateTime(n.createdAt, locale)}</span>
                    </div>
                  );
                  const rowLinkClass = styles.feedRow;
                  return (
                    <li key={n.id}>
                      {n.href !== null ? (
                        <Link href={n.href} className={rowLinkClass}>
                          {face}
                          {card}
                        </Link>
                      ) : (
                        <div className={rowLinkClass}>
                          {face}
                          {card}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
