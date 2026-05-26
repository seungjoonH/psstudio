// 알림 목록·삭제 UI 클라이언트입니다.
"use client";

import type { HomeRecentNotification } from "../../src/auth/api.server";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import Link from "next/link";
import { formatKstDateTime } from "../../src/i18n/formatDateTime";
import { useI18n } from "../../src/i18n/I18nProvider";
import { notificationActorDisplayName } from "../../src/lib/notificationActorDisplayName";
import { notificationUsesAssignmentGlyph } from "../../src/lib/notificationUsesAssignmentGlyph";
import {
  useDeleteAllNotificationsMutation,
  useDeleteNotificationMutation,
  useInvalidateNotifications,
  useNotificationsQuery,
} from "../../src/notifications/hooks";
import { useNotificationStream } from "../../src/notifications/useNotificationStream";
import { NotificationTitle } from "../../src/notifications/NotificationTitle";
import { AssignmentNotificationGlyph } from "../../src/ui/AssignmentNotificationGlyph";
import { DeadlineSoonNotificationGlyph } from "../../src/ui/DeadlineSoonNotificationGlyph";
import { Button } from "../../src/ui/Button";
import { UserAvatar } from "../../src/ui/UserAvatar";
import styles from "./notifications.module.css";

type Props = {
  items: HomeRecentNotification[];
};

export function NotificationsClient({ items }: Props) {
  const { locale, t } = useI18n();
  const notificationsQuery = useNotificationsQuery(100, items);
  const deleteOne = useDeleteNotificationMutation();
  const deleteAll = useDeleteAllNotificationsMutation();
  const invalidateNotifications = useInvalidateNotifications();
  const rows = notificationsQuery.data ?? [];

  useNotificationStream(() => {
    void invalidateNotifications();
  });

  async function onDeleteOne(id: string) {
    try {
      await deleteOne.mutateAsync(id);
    } catch {
      window.alert(t("notifications.deleteFailed"));
    }
  }

  async function onDeleteAll() {
    if (!window.confirm(t("notifications.deleteAllConfirm"))) return;
    try {
      await deleteAll.mutateAsync();
    } catch {
      window.alert(t("notifications.deleteFailed"));
    }
  }

  return (
    <div>
      {rows.length > 0 ? (
        <div className={styles.toolbar}>
          <Button type="button" variant="danger" onClick={() => void onDeleteAll()} disabled={deleteAll.isPending}>
            {t("notifications.deleteAll")}
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className={styles.empty}>{t("notifications.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((n) => {
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
                  disabled={deleteOne.isPending}
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
