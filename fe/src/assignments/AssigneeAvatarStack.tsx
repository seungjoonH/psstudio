// 과제 대상자 프로필 이미지를 겹쳐 표시하는 스택 컴포넌트입니다.
"use client";

import { buildCls } from "../lib/buildCls";
import { UserAvatar } from "../ui/UserAvatar";
import styles from "./AssigneeAvatarStack.module.css";

export type AssigneeAvatar = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
};

type Props = {
  assignees: AssigneeAvatar[];
  size?: number;
  maxVisible?: number;
  className?: string;
};

export function AssigneeAvatarStack({
  assignees,
  size = 22,
  maxVisible = 6,
  className,
}: Props) {
  if (assignees.length === 0) return null;

  const visible = assignees.slice(0, maxVisible);
  const overflow = assignees.length - visible.length;

  return (
    <div className={buildCls(styles.stack, className)} aria-hidden>
      {visible.map((assignee) => (
        <UserAvatar
          key={assignee.userId}
          nickname={assignee.nickname}
          imageUrl={assignee.profileImageUrl}
          size={size}
          className={styles.avatar}
        />
      ))}
      {overflow > 0 ? <span className={styles.more}>+{overflow}</span> : null}
    </div>
  );
}
