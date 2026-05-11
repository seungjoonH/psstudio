// 마감 임박 알림 행 왼쪽에 캘린더 아이콘을 원형 배지로 표시합니다.
import { buildCls } from "../lib/buildCls";
import { Icon } from "./Icon";
import styles from "./DeadlineSoonNotificationGlyph.module.css";

type Props = {
  className?: string;
};

export function DeadlineSoonNotificationGlyph({ className }: Props) {
  return (
    <span className={buildCls(styles.root, className)} aria-hidden>
      <Icon name="calendar" size={18} />
    </span>
  );
}
