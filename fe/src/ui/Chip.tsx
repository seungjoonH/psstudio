// 칩(필터/태그) 컴포넌트입니다.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Chip.module.css";

type ChipProps = {
  active?: boolean;
  leftIcon?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ active = false, leftIcon, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button {...rest} type={type} className={buildCls(styles.root, active ? styles.active : "", className)}>
      {leftIcon !== undefined ? <span className={styles.icon}>{leftIcon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
