"use client";

// 그룹 홈 화면. 내가 속한 그룹 카드와 그룹 생성/초대코드 가입 액션을 제공합니다.
import Link from "next/link";
import { useState } from "react";
import type { GroupListItem } from "../../../src/groups/server";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { AppShell } from "../../../src/shell/AppShell";
import { Button } from "../../../src/ui/Button";
import { Icon } from "../../../src/ui/Icon";
import { Modal } from "../../../src/ui/Modal";
import { UserAvatar } from "../../../src/ui/UserAvatar";
import { JoinByCodeCard } from "../JoinByCodeCard";
import styles from "./page.module.css";

type Props = {
  groups: GroupListItem[];
};

export function GroupsExploreView({ groups }: Props) {
  const { t } = useI18n();
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <AppShell titleKey="groupsExplore.title" subtitleKey="groupsExplore.subtitle">
      <div className={styles.layout}>
        <div className={styles.actions}>
          <Link href="/groups/new">
            <Button type="button" variant="primary">
              {t("groupsAdd.createTitle")}
            </Button>
          </Link>
          <Button type="button" variant="secondary" onClick={() => setJoinOpen(true)}>
            {t("groupsAdd.joinTitle")}
          </Button>
        </div>

        {groups.length === 0 ? (
          <p className={styles.empty}>{t("groups.empty.desc")}</p>
        ) : (
          <ul className={styles.grid}>
            {groups.map((group) => (
              <li key={group.id} className={styles.card}>
                <Link href={`/groups/${group.id}`} className={styles.cardLink}>
                  <strong className={styles.groupName}>
                    <Icon name="users" size={16} className={styles.groupNameIcon} />
                    {group.name}
                  </strong>
                  {group.description.trim().length > 0 ? (
                    <p className={styles.groupDescription}>{group.description.trim()}</p>
                  ) : null}
                  <span className={styles.groupMeta}>
                    {t("groups.memberCount", { count: group.memberCount })}
                    {" · "}
                    {t("groupsExplore.pendingTodos", { count: group.myPendingAssignmentCount })}
                  </span>
                  {group.memberPreviews.length > 0 ? (
                    <div className={styles.avatarStack} aria-hidden>
                      {group.memberPreviews.slice(0, 3).map((member) => (
                        <UserAvatar
                          key={member.userId}
                          nickname={member.nickname}
                          imageUrl={member.profileImageUrl}
                          size={44}
                          className={styles.avatar}
                        />
                      ))}
                      {group.memberCount > 3 ? (
                        <span className={styles.avatarMore}>+{group.memberCount - 3}</span>
                      ) : null}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={joinOpen}
        title={t("groupsAdd.joinTitle")}
        onClose={() => setJoinOpen(false)}
        dialogClassName={styles.joinModal}
      >
        <JoinByCodeCard variant="inline" />
      </Modal>
    </AppShell>
  );
}
