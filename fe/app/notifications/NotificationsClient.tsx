// 알림 목록·삭제 UI 클라이언트입니다.
"use client";

import type { HomeRecentNotification } from "../../src/auth/api.server";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatKstDateTime } from "../../src/i18n/formatDateTime";
import { useI18n } from "../../src/i18n/I18nProvider";
import { notificationActorDisplayName } from "../../src/lib/notificationActorDisplayName";
import { notificationUsesAssignmentGlyph } from "../../src/lib/notificationUsesAssignmentGlyph";
import { useNotificationStream } from "../../src/notifications/useNotificationStream";
import { NotificationTitle } from "../../src/notifications/NotificationTitle";
import { AssignmentNotificationGlyph } from "../../src/ui/AssignmentNotificationGlyph";
import { DeadlineSoonNotificationGlyph } from "../../src/ui/DeadlineSoonNotificationGlyph";
import { Button } from "../../src/ui/Button";
import { UserAvatar } from "../../src/ui/UserAvatar";
import { deleteAllNotificationsAction, deleteNotificationAction } from "./actions";
import styles from "./notifications.module.css";

type Props = {
  items: HomeRecentNotification[];
};

export function NotificationsClient({ items }: Props) {
  const { locale, t } = useI18n();
  const router = useRouter();

  useNotificationStream(() => {
    router.refresh();
  });

  async function onDeleteOne(id: string) {
    try {
      await deleteNotificationAction(id);
      router.refresh();
    } catch {
      window.alert(t("notifications.deleteFailed"));
    }
  }

  async function onDeleteAll() {
    if (!window.confirm(t("notifications.deleteAllConfirm"))) return;
    try {
      await deleteAllNotificationsAction();
      router.refresh();
    } catch {
      window.alert(t("notifications.deleteFailed"));
    }
  }

  return (
    <div>
      {items.length > 0 ? (
        <div className={styles.toolbar}>
          <Button type="button" variant="danger" onClick={() => void onDeleteAll()}>
            {t("notifications.deleteAll")}
          </Button>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className={styles.empty}>{t("notifications.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((n) => {
            const showActorFace =
              n.type !== NOTIFICATION_TYPES.ASSIGNMENT_CREATED && n.type !== NOTIFICATION_TYPES.DEADLINE_SOON;
            const useAssignmentGlyph = notificationUsesAssignmentGlyph(n.type);
            const face =
              n.type === NOTIFICATION_TYPES.DEADLINE_SOON ? (
                <DeadlineSoonNotificationGlyph className={styles.avatar} />
              ) : useAssignmentGlyph ? (
                <AssignmentNotificationGlyph className={styles.avatar} />
              ) : showActorFace ? (
                <UserAvatar
                  nickname={notificationActorDisplayName(n)}
                  imageUrl={n.actorProfileImageUrl ?? ""}
                  size={40}
                  className={styles.avatar}
                />
              ) : null;
            const body = (
              <div className={styles.rowBody}>
                <NotificationTitle
                  type={n.type}
                  title={n.title}
                  actorNickname={n.actorNickname}
                  className={styles.title}
                />
                <span className={styles.time}>{formatKstDateTime(n.createdAt, locale)}</span>
              </div>
            );
            return (
              <li key={n.id} className={styles.row}>
                {n.href !== null ? (
                  <Link href={n.href} className={styles.rowMain}>
                    {face}
                    {body}
                  </Link>
                ) : (
                  <div className={styles.rowMain}>
                    {face}
                    {body}
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.deleteBtn}
                  aria-label={t("notifications.deleteOneAria")}
                  onClick={() => void onDeleteOne(n.id)}
                >
                  {t("notifications.deleteOne")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
