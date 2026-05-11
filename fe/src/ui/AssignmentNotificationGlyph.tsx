// 과제 등록·마감 임박 알림 행 왼쪽에 붙는 원형 과제 아이콘입니다.
import { buildCls } from "../lib/buildCls";
import { Icon } from "./Icon";
import styles from "./AssignmentNotificationGlyph.module.css";

type Props = {
  className?: string;
};

export function AssignmentNotificationGlyph({ className }: Props) {
  return (
    <span className={buildCls(styles.root, className)} aria-hidden>
      <Icon name="book" size={20} />
    </span>
  );
}
