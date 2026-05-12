// 과제 목록 카드를 공통 스타일/동작으로 렌더링하는 컴포넌트입니다.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { formatAssignmentAlgorithmLabel, formatProblemPlatformLabel } from "./algorithmLabels";
import { dueBadgeTone } from "../lib/dueBadgeTone";
import { Badge } from "../ui/Badge";
import { DifficultyBadge } from "../ui/DifficultyBadge";
import { buildCls } from "../lib/buildCls";
import { Icon } from "../ui/Icon";
import styles from "./AssignmentList.module.css";

export type AssignmentListItem = {
  id: string;
  href: string;
  title: string;
  dueAt: string;
  isLate: boolean;
  isAssignedToMe: boolean;
  hasMySubmission?: boolean;
  platform: string;
  difficulty: string | null;
  analysisStatus?: string;
  groupName?: string;
  algorithms?: string[];
  algorithmsHiddenUntilSubmit?: boolean;
};

type Props = {
  items: AssignmentListItem[];
  showGroupName: boolean;
};

export function AssignmentList({ items, showGroupName }: Props) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <AssignmentListRow key={item.id} item={item} showGroupName={showGroupName} />
      ))}
    </ul>
  );
}

function AssignmentListRow({ item, showGroupName }: { item: AssignmentListItem; showGroupName: boolean }) {
  const { t, locale } = useI18n();
  const [showDueAt, setShowDueAt] = useState(false);
  const due = useMemo(() => new Date(item.dueAt), [item.dueAt]);
  const daysLeft = Math.max(0, Math.ceil((due.getTime() - Date.now()) / (24 * 3600 * 1000)));
  const statusLabel = item.isLate ? t("assignment.list.late") : `D-${daysLeft}`;
  const dueTone = dueBadgeTone(item.isLate, daysLeft);
  const platformLabel = formatProblemPlatformLabel(locale, item.platform);
  const algorithmsVisible =
    (item.algorithmsHiddenUntilSubmit ?? true) ? item.hasMySubmission === true : true;
  const showAlgorithmBadges = algorithmsVisible && (item.algorithms?.length ?? 0) > 0;

  return (
    <li className={buildCls(styles.row, item.isLate ? styles.rowPastDue : undefined)}>
      <Link href={item.href} className={styles.link}>
        <div className={styles.head}>
          <div className={styles.headMain}>
            <div className={styles.titleRow}>
              <span className={styles.title}>
                <Icon name="task" size={16} className={styles.titleIcon} />
                <span className={styles.titleText}>{item.title}</span>
              </span>
              {showGroupName && item.groupName ? <span className={styles.groupInline}>{item.groupName}</span> : null}
              {item.isAssignedToMe ? <span className={styles.myBadge}>{t("assignment.list.assignedToMe")}</span> : null}
              <div className={styles.titleNear}>
                <Badge tone="neutral" chipIndex={1}>
                  {platformLabel}
                </Badge>
                <DifficultyBadge platform={item.platform} difficulty={item.difficulty} />
              </div>
            </div>
          </div>
          <div className={styles.headRight}>
            {item.analysisStatus !== undefined && item.analysisStatus !== "DONE" ? (
              <Badge tone="warning">{t("assignment.list.analysis", { status: item.analysisStatus })}</Badge>
            ) : null}
            <div className={styles.topRight}>
              <button
                type="button"
                className={styles.dueToggle}
                onClick={(e) => {
                  e.preventDefault();
                  if (!item.isLate) setShowDueAt((v) => !v);
                }}
                aria-label={
                  showDueAt ? t("assignment.detail.dueToggleRemain") : t("assignment.detail.dueToggleDate")
                }
              >
                <Badge tone={dueTone}>
                  {showDueAt && !item.isLate ? due.toLocaleString() : statusLabel}
                </Badge>
              </button>
              {item.hasMySubmission !== undefined ? (
                <Badge tone={item.hasMySubmission ? "success" : "danger"}>
                  {item.hasMySubmission ? t("assignment.list.solved") : t("assignment.list.unsolved")}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div
          className={styles.meta}
          aria-hidden={!showAlgorithmBadges}
        >
          {showAlgorithmBadges
            ? (item.algorithms ?? []).map((tag, index) => (
                <Badge key={`${item.id}-algo-${tag}-${index}`} tone="neutral">
                  {formatAssignmentAlgorithmLabel(locale, tag)}
                </Badge>
              ))
            : null}
        </div>
      </Link>
    </li>
  );
}
