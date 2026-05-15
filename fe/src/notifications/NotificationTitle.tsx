// 알림 제목을 locale·유형에 맞게 조합해 최대 3줄까지 표시합니다.
"use client";

import { useRef } from "react";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import { useI18n } from "../i18n/I18nProvider";
import { buildCls } from "../lib/buildCls";
import {
  parseAssignmentCreatedTitle,
  parseDeadlineSoonTitle,
  parseReactionTitle,
} from "../lib/parseNotificationTitle";
import styles from "./NotificationTitle.module.css";
import { useFittedAssignmentTitle } from "./useFittedAssignmentTitle";

type Props = {
  type: string;
  title: string;
  actorNickname?: string | null;
  className?: string;
};

function formatLeadTimeLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  leadTimeMinutes: number | null,
): string {
  if (leadTimeMinutes === 60) return t("notifications.title.leadTime.oneHour");
  if (leadTimeMinutes === 1440) return t("notifications.title.leadTime.oneDay");
  if (leadTimeMinutes !== null && leadTimeMinutes > 0) {
    return t("notifications.title.leadTime.minutes", { minutes: leadTimeMinutes });
  }
  return t("notifications.title.leadTime.generic");
}

function resolveActorLabel(actorNickname: string | null | undefined, title: string): string | null {
  if (typeof actorNickname === "string" && actorNickname.trim().length > 0) {
    return actorNickname.trim();
  }
  const match = /^(.+?)님이/.exec(title.trim());
  if (match?.[1] === undefined) return null;
  const parsed = match[1].trim();
  return parsed.length > 0 ? parsed : null;
}

function localizeActorTitle(
  type: string,
  title: string,
  actorNickname: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  const actor = resolveActorLabel(actorNickname, title);
  if (actor === null) return null;

  switch (type) {
    case NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION:
      return t("notifications.title.reviewOnMySubmission", { actor });
    case NOTIFICATION_TYPES.COMMENT_ON_MY_SUBMISSION:
      return t("notifications.title.commentOnMySubmission", { actor });
    case NOTIFICATION_TYPES.REPLY_ON_MY_COMMENT:
      return t("notifications.title.replyOnMyComment", { actor });
    case NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW:
    case NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE:
      return t("notifications.title.replyOnReviewThread", { actor });
    case NOTIFICATION_TYPES.REACTION_ON_MY_REVIEW_THREAD: {
      const parsed = parseReactionTitle(title);
      const emoji = parsed?.emoji ?? "";
      if (emoji.length === 0) return null;
      return t("notifications.title.reactionOnReviewThread", { actor, emoji });
    }
    default:
      return null;
  }
}

function AssignmentCreatedTitle({
  groupName,
  assignmentTitle,
  className,
}: {
  groupName: string;
  assignmentTitle: string;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLParagraphElement>(null);
  const fittedTitle = useFittedAssignmentTitle(containerRef, assignmentTitle);
  const createdClassName = buildCls(
    styles.root,
    styles.assignmentCreated,
    styles.assignmentCreatedClamp,
    className,
  );

  if (locale === "en") {
    return (
      <p ref={containerRef} className={createdClassName}>
        <span className={styles.fixed}>&quot;</span>
        <span data-assignment-title>{fittedTitle}</span>
        <span className={styles.fixed}>{t("notifications.title.assignmentCreated.enMiddle")}</span>
        {groupName}
        <span className={styles.fixed}>{t("notifications.title.assignmentCreated.enSuffix")}</span>
      </p>
    );
  }

  return (
    <p ref={containerRef} className={createdClassName}>
      {groupName}
      {t("notifications.title.assignmentCreated.koMiddle")}
      <span data-assignment-title>{fittedTitle}</span>
      {t("notifications.title.assignmentCreated.koSuffix")}
    </p>
  );
}

function DeadlineSoonTitle({
  assignmentTitle,
  leadTimeMinutes,
  className,
}: {
  assignmentTitle: string | null;
  leadTimeMinutes: number | null;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const leadTime = formatLeadTimeLabel(t, leadTimeMinutes);
  const containerRef = useRef<HTMLParagraphElement>(null);
  const fittedTitle = useFittedAssignmentTitle(containerRef, assignmentTitle ?? "");
  const deadlineClassName = buildCls(
    styles.root,
    styles.assignmentCreated,
    styles.assignmentCreatedClamp,
    className,
  );

  if (assignmentTitle !== null) {
    if (locale === "en") {
      return (
        <p ref={containerRef} className={deadlineClassName}>
          <span className={styles.fixed}>&quot;</span>
          <span data-assignment-title>{fittedTitle}</span>
          <span className={styles.fixed}>
            {t("notifications.title.deadlineSoon.enWithTitle", { leadTime })}
          </span>
        </p>
      );
    }
    return (
      <p ref={containerRef} className={deadlineClassName}>
        <span className={styles.fixed}>&quot;</span>
        <span data-assignment-title>{fittedTitle}</span>
        <span className={styles.fixed}>
          {t("notifications.title.deadlineSoon.koWithTitle", { leadTime })}
        </span>
      </p>
    );
  }

  const plainText = t("notifications.title.deadlineSoon.withoutTitle", { leadTime });
  return <p className={buildCls(styles.root, styles.plain, className)}>{plainText}</p>;
}

export function NotificationTitle({ type, title, actorNickname, className }: Props) {
  const { t } = useI18n();

  if (type === NOTIFICATION_TYPES.ASSIGNMENT_CREATED) {
    const parsed = parseAssignmentCreatedTitle(title);
    if (parsed !== null) {
      return (
        <AssignmentCreatedTitle
          groupName={parsed.groupName}
          assignmentTitle={parsed.assignmentTitle}
          className={className}
        />
      );
    }
  }

  if (type === NOTIFICATION_TYPES.DEADLINE_SOON) {
    const parsed = parseDeadlineSoonTitle(title);
    if (parsed !== null) {
      return (
        <DeadlineSoonTitle
          assignmentTitle={parsed.assignmentTitle}
          leadTimeMinutes={parsed.leadTimeMinutes}
          className={className}
        />
      );
    }
  }

  const localizedActor = localizeActorTitle(type, title, actorNickname, t);
  const displayTitle = localizedActor ?? title;

  return <p className={buildCls(styles.root, styles.plain, className)}>{displayTitle}</p>;
}
