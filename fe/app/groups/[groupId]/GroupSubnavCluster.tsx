"use client";

// 그룹 서브 탭과 브레드크럼을 한 카드 안에서 가로로 배치합니다.
import type { ReactNode } from "react";
import { GroupContextNav } from "./GroupContextNav";
import styles from "./GroupSubnavCluster.module.css";

type Props = {
  groupId: string;
  children: ReactNode;
};

export function GroupSubnavCluster({ groupId, children }: Props) {
  return (
    <div className={styles.cluster}>
      <div className={styles.navBar}>
        <GroupContextNav groupId={groupId} embedded />
        <div className={styles.crumbSlot}>{children}</div>
      </div>
    </div>
  );
}
