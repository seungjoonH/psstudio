"use client";

// 과제별 제출 목록 화면을 i18n 적용해 렌더링합니다.
import Link from "next/link";
import { useI18n } from "../../../../../../src/i18n/I18nProvider";
import type { SubmissionListItemDto } from "../../../../../../src/submissions/server";
import { AppShell } from "../../../../../../src/shell/AppShell";
import { Badge } from "../../../../../../src/ui/Badge";
import { Button } from "../../../../../../src/ui/Button";
import { EmptyState } from "../../../../../../src/ui/states/EmptyState";
import { UserAvatar } from "../../../../../../src/ui/UserAvatar";
import { GroupSubnavCluster } from "../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../GroupRouteBreadcrumbs";
import styles from "./page.module.css";

type Props = {
  groupId: string;
  groupName: string;
  assignmentId: string;
  assignmentTitle: string;
  sort: "createdAtAsc" | "createdAtDesc";
  items: SubmissionListItemDto[];
};

export function SubmissionsListClient({
  groupId,
  groupName,
  assignmentId,
  assignmentTitle,
  sort,
  items,
}: Props) {
  const { t } = useI18n();

  return (
    <AppShell
      title={`${groupName} ${t("groupNav.assignments")}`}
      subtitleKey="assignment.list.subtitle"
      actions={
        <Link href={`/groups/${groupId}/assignments/${assignmentId}/submissions/new`}>
          <Button type="button" variant="primary">
            {t("submission.list.new")}
          </Button>
        </Link>
      }
    >
      <GroupSubnavCluster groupId={groupId}>
        <GroupRouteBreadcrumbs groupId={groupId} assignmentTitle={assignmentTitle} />
      </GroupSubnavCluster>
      <div className={styles.toolbar}>
        <Link
          href={`/groups/${groupId}/assignments/${assignmentId}/submissions?sort=createdAtDesc`}
          className={sort === "createdAtDesc" ? styles.tabActive : styles.tab}
        >
          {t("submission.list.sortAsc")}
        </Link>
        <Link
          href={`/groups/${groupId}/assignments/${assignmentId}/submissions?sort=createdAtAsc`}
          className={sort === "createdAtAsc" ? styles.tabActive : styles.tab}
        >
          {t("submission.list.sortDesc")}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          titleKey="submission.list.emptyTitle"
          descriptionKey="submission.list.emptyDesc"
        />
      ) : (
        <ul className={styles.list}>
          {items.map((s) => (
            <li key={s.id} className={styles.row}>
              <Link
                href={`/groups/${groupId}/assignments/${assignmentId}/submissions/${s.id}`}
                className={styles.link}
              >
                <div className={styles.head}>
                  <div className={styles.author}>
                    <UserAvatar
                      nickname={s.authorNickname}
                      imageUrl={s.authorProfileImageUrl}
                      size={24}
                      className={styles.avatar}
                    />
                    <span className={styles.nickname}>{s.authorNickname}</span>
                  </div>
                  <div className={styles.meta}>
                    <Badge tone="neutral">{s.language}</Badge>
                    <Badge tone="neutral">v{s.currentVersionNo}</Badge>
                    {s.isLate ? (
                      <Badge tone="warning">{t("submission.list.late")}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className={styles.title}>{s.title}</div>
                <div className={styles.timestamp}>
                  {new Date(s.createdAt).toLocaleString()}
                  {s.currentVersionNo > 1
                    ? ` · ${t("submission.list.lastEdit", {
                        date: new Date(s.updatedAt).toLocaleString(),
                      })}`
                    : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
