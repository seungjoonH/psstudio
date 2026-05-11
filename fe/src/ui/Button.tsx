// 공용 버튼 컴포넌트입니다.
import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export type ButtonProps = {
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
  /** true이면 비활성화하고 앞에 로딩 스피너를 표시합니다. */
  loading?: boolean;
  /** onClick이 Promise를 반환할 때 자동으로 로딩/비활성화를 적용합니다. */
  autoLoadingOnClick?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "secondary",
  leftIcon,
  loading = false,
  autoLoadingOnClick = true,
  className,
  children,
  type = "button",
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const activeLoading = loading || internalLoading;
  const isDisabled = disabled === true || activeLoading;

  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"] = (event) => {
    if (isDisabled) return;
    const result = onClick?.(event) as unknown;
    if (!autoLoadingOnClick || !isPromiseLike(result)) return;
    setInternalLoading(true);
    result.finally(() => setInternalLoading(false));
  };

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={activeLoading || undefined}
      onClick={handleClick}
      className={buildCls(styles.root, styles[variant], activeLoading ? styles.loading : undefined, className)}
    >
      {activeLoading ? (
        <span className={styles.spinner} aria-hidden />
      ) : leftIcon !== undefined ? (
        <span className={styles.icon}>{leftIcon}</span>
      ) : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
