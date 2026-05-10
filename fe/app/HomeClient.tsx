"use client";

// 홈 화면 대시보드. 로그인 상태에 따라 환영 화면 또는 최근 활동 카드를 표시합니다.
import type { MeResponse } from "@psstudio/shared";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import Link from "next/link";
import type { HomeRecentNotification } from "../src/auth/api.server";
import { LoginClient } from "./login/LoginClient";
import { useI18n } from "../src/i18n/I18nProvider";
import { dueBadgeTone } from "../src/lib/dueBadgeTone";
import { notificationActorDisplayName } from "../src/lib/notificationActorDisplayName";
import { Badge } from "../src/ui/Badge";
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
                  return (
                    <li key={item.id}>
                      <Link href={item.href} className={styles.feedRow}>
                        <div className={styles.feedMain}>
                          <span className={styles.listTitle}>{item.title}</span>
                          <span className={styles.listMeta}>
                            <Badge tone="neutral">{item.groupName}</Badge>
                            <Badge tone="neutral">{item.platform}</Badge>
                          </span>
                          <Badge tone={dueBadgeTone(isLate, daysLeft)} className={styles.duePill}>
                            {formatDateTime(item.dueAt, locale)}
                          </Badge>
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
                          <span className={styles.listLang}>{s.language}</span>
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
                const showActorFace = n.type !== NOTIFICATION_TYPES.ASSIGNMENT_CREATED;
                const face = showActorFace ? (
                  <UserAvatar
                    nickname={notificationActorDisplayName(n)}
                    imageUrl={n.actorProfileImageUrl ?? ""}
                    size={40}
                    className={styles.feedAvatar}
                  />
                ) : null;
                const main = (
                  <div className={styles.feedMain}>
                    <span className={styles.notifTitle}>{n.title}</span>
                    <span className={styles.listTime}>{formatDateTime(n.createdAt, locale)}</span>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href !== null ? (
                      <Link href={n.href} className={styles.feedRow}>
                        {face}
                        {main}
                      </Link>
                    ) : (
                      <div className={styles.feedRowStatic}>
                        {face}
                        {main}
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
