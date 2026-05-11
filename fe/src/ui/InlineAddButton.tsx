// 코드리뷰/캘린더에서 공통으로 쓰는 인라인 + 버튼 컴포넌트입니다.
import type { ButtonHTMLAttributes } from "react";
import { buildCls } from "../lib/buildCls";
import { Icon } from "./Icon";
import styles from "./InlineAddButton.module.css";

type InlineAddButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function InlineAddButton({ type = "button", className, children, ...rest }: InlineAddButtonProps) {
  return (
    <button {...rest} type={type} className={buildCls(styles.root, className)}>
      {children ?? <Icon name="plus" size={12} className={styles.icon} />}
    </button>
  );
}
