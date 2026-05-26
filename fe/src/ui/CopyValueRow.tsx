// monospace 값과 복사 버튼을 한 줄로 보여주는 행 컴포넌트입니다.
"use client";

import { buildCls } from "../lib/buildCls";
import { CopyButton } from "./CopyButton";
import styles from "./CopyValueRow.module.css";

type Props = {
  value: string;
  copyText?: string;
  disabled?: boolean;
  disabledTitle?: string;
  copyAriaLabel: string;
  copyDoneAriaLabel: string;
  className?: string;
};

export function CopyValueRow({
  value,
  copyText,
  disabled = false,
  disabledTitle,
  copyAriaLabel,
  copyDoneAriaLabel,
  className,
}: Props) {
  const clipboardText = copyText ?? value;

  return (
    <div className={buildCls(styles.root, className)}>
      <div className={styles.content}>
        <code className={styles.value}>{value}</code>
        <CopyButton
          text={clipboardText}
          disabled={disabled || clipboardText.length === 0}
          disabledTitle={disabledTitle}
          copyAriaLabel={copyAriaLabel}
          copyDoneAriaLabel={copyDoneAriaLabel}
        />
      </div>
    </div>
  );
}
