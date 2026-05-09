// 폼 전송과 호환되는 접근 가능한 토글 스위치입니다.
import type { ChangeEvent, ReactNode } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Switch.module.css";

type Props = {
  name: string;
  /** 비제어 모드 초기값 (`checked`와 함께 쓰지 않음) */
  defaultChecked?: boolean;
  /** 제어 모드 (`defaultChecked`와 함께 쓰지 않음) */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function Switch({
  name,
  defaultChecked,
  checked,
  onCheckedChange,
  children,
  icon,
  className,
}: Props) {
  const controlled = checked !== undefined;
  const inputProps = controlled
    ? {
        checked,
        onChange: (e: ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked),
      }
    : { defaultChecked };

  return (
    <label className={buildCls(styles.root, className)}>
      <span className={styles.label}>
        {icon !== undefined ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.text}>{children}</span>
      </span>
      <span className={styles.trackWrap}>
        <input type="checkbox" name={name} className={styles.native} {...inputProps} />
        <span className={styles.track} aria-hidden />
      </span>
    </label>
  );
}
