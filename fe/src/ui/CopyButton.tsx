// 클립보드에 문자열을 복사하는 아이콘 버튼입니다.
"use client";

import { useEffect, useState } from "react";
import { buildCls } from "../lib/buildCls";
import { Icon } from "./Icon";
import styles from "./CopyButton.module.css";

type Props = {
  text: string;
  disabled?: boolean;
  disabledTitle?: string;
  copyAriaLabel: string;
  copyDoneAriaLabel: string;
  className?: string;
};

export function CopyButton({
  text,
  disabled = false,
  disabledTitle,
  copyAriaLabel,
  copyDoneAriaLabel,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={buildCls(styles.button, className)}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      aria-label={disabled ? disabledTitle : copied ? copyDoneAriaLabel : copyAriaLabel}
      onClick={async () => {
        if (disabled || text.length === 0) return;
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={16} />
    </button>
  );
}
