"use client";

// 홈 화면 대시보드. 로그인 상태에 따라 환영 화면 또는 최근 활동 카드를 표시합니다.
import type { MeResponse } from "@psstudio/shared";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HomeRecentNotification } from "../src/auth/api.server";
import { deleteAllNotificationsAction, deleteNotificationAction } from "./notifications/actions";
import { LoginClient } from "./login/LoginClient";
import { useI18n } from "../src/i18n/I18nProvider";
import { buildCls } from "../src/lib/buildCls";
import { dueBadgeTone } from "../src/lib/dueBadgeTone";
import { formatRelativeRecency } from "../src/lib/formatRelativeRecency";
import { homeNotificationKind } from "../src/lib/homeNotificationKind";
import { notificationUsesAssignmentGlyph } from "../src/lib/notificationUsesAssignmentGlyph";
import { notificationActorDisplayName } from "../src/lib/notificationActorDisplayName";
import { resolveShikiLanguage } from "../src/lib/shikiLanguage";
import { formatAssignmentAlgorithmLabel } from "../src/assignments/algorithmLabels";
import { AssignmentNotificationGlyph } from "../src/ui/AssignmentNotificationGlyph";
import { DeadlineSoonNotificationGlyph } from "../src/ui/DeadlineSoonNotificationGlyph";
import { Badge } from "../src/ui/Badge";
import { Button } from "../src/ui/Button";
import { DifficultyBadge } from "../src/ui/DifficultyBadge";
import { Icon } from "../src/ui/Icon";
import { UserAvatar } from "../src/ui/UserAvatar";
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
  todoItems?: HomeTodoItem[];
};

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

export function HomeClient({
  me,
  loginApiBase,
  notifications = [],
  submissions = [],
  todoItems = [],
}: Props) {
  const { locale, t } = useI18n();
  const router = useRouter();

  async function onDeleteHomeNotification(id: string) {
    try {
      await deleteNotificationAction(id);
      router.refresh();
    } catch {
      window.alert(t("notifications.deleteFailed"));
    }
  }

  async function onDeleteAllHomeNotifications() {
    if (!window.confirm(t("notifications.deleteAllConfirm"))) return;
    try {
      await deleteAllNotificationsAction();
      router.refresh();
    } catch {
      window.alert(t("notifications.deleteFailed"));
    }
  }

  if (me === null) {
    return <LoginClient apiBase={loginApiBase} />;
  }

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
            <span className={styles.statValue}>{todoItems.length}</span>
            <span className={styles.statLabel}>{t("home.kanban.todoCount")}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{submissions.length}</span>
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
                              <span className={styles.kanbanItemTitle}>
                                <Icon name="book" size={14} className={styles.kanbanItemTitleIcon} aria-hidden />
                                <span className={styles.kanbanItemTitleText}>{item.title}</span>
                              </span>
                              <span className={styles.todoTitleNear}>
                                <Badge tone="neutral" chipIndex={1}>
                                  {item.platform}
                                </Badge>
                                <DifficultyBadge platform={item.platform} difficulty={item.difficulty} />
                                <Badge tone="neutral" chipIndex={0}>
                                  {item.groupName}
                                </Badge>
                              </span>
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
                          <div className={styles.todoCardActions}>
                            <Badge tone={dueBadgeTone(isLate, daysLeft)}>{dueLabel}</Badge>
                            <Badge tone="danger">{t("assignment.list.unsolved")}</Badge>
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
              <Icon name="check" size={16} />
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
                          <span className={styles.listTime}>{formatDateTime(s.createdAt, locale)}</span>
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
              <h2 id="home-notif-title" className={styles.cardTitle}>
                {t("home.recent.notifications.title")}
              </h2>
              <p className={styles.cardDesc}>{t("home.kanban.noticeDesc")}</p>
            </div>
          </header>
          <div className={styles.columnBody}>
            {notifications.length === 0 ? (
              <p className={styles.cardEmpty}>{t("home.recent.notifications.empty")}</p>
            ) : (
              <>
                <div className={styles.notifToolbar}>
                  <Button type="button" variant="danger" onClick={() => void onDeleteAllHomeNotifications()}>
                    {t("notifications.deleteAll")}
                  </Button>
                </div>
                <div className={styles.notifListCard}>
                  <ul className={styles.notifList}>
                    {notifications.map((n) => {
                      const showActorFace =
                        n.type !== NOTIFICATION_TYPES.ASSIGNMENT_CREATED &&
                        n.type !== NOTIFICATION_TYPES.DEADLINE_SOON;
                      const useAssignmentGlyph = notificationUsesAssignmentGlyph(n.type);
                      const kindKey = homeNotificationKind(n.type);
                      const kindLabel = t(`home.recent.notifications.kind.${kindKey}`);
                      const recency = formatRelativeRecency(n.createdAt, locale);
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
                        <div className={styles.kanbanCard}>
                          <div className={styles.kanbanItemTop}>
                            <span className={buildCls(styles.notifTitle, styles.notifTitleKanban)}>{n.title}</span>
                            <div className={styles.kanbanItemTopRight}>
                              <Badge tone="neutral">{recency}</Badge>
                            </div>
                          </div>
                          <span className={styles.listMeta}>
                            <Badge tone="neutral">{kindLabel}</Badge>
                            {showActorFace ? (
                              <Badge tone="neutral">{notificationActorDisplayName(n)}</Badge>
                            ) : null}
                          </span>
                        </div>
                      );
                      const mainClass = buildCls(styles.notifRowMain, styles.feedRowAlignStart);
                      return (
                        <li key={n.id} className={styles.notifListRow}>
                          {n.href !== null ? (
                            <Link href={n.href} className={mainClass}>
                              {face}
                              {card}
                            </Link>
                          ) : (
                            <div className={mainClass}>
                              {face}
                              {card}
                            </div>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            className={styles.notifDeleteBtn}
                            aria-label={t("notifications.deleteOneAria")}
                            onClick={() => void onDeleteHomeNotification(n.id)}
                          >
                            {t("notifications.deleteOne")}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
