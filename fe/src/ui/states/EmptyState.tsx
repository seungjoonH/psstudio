"use client";

// 빈 상태 UI 블록입니다.
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import styles from "./States.module.css";

type Vars = Record<string, string | number>;

type EmptyStateProps = {
  title?: string;
  titleKey?: string;
  titleVars?: Vars;
  description?: string;
  descriptionKey?: string;
  descriptionVars?: Vars;
  action?: ReactNode;
};

export function EmptyState({
  title,
  titleKey,
  titleVars,
  description,
  descriptionKey,
  descriptionVars,
  action,
}: EmptyStateProps) {
  const { t } = useI18n();
  const resolvedTitle = title ?? (titleKey !== undefined ? t(titleKey, titleVars) : "");
  const resolvedDesc =
    description ?? (descriptionKey !== undefined ? t(descriptionKey, descriptionVars) : undefined);
  return (
    <section className={styles.box} aria-label={resolvedTitle}>
      <h3 className={styles.title}>{resolvedTitle}</h3>
      {resolvedDesc !== undefined ? <p className={styles.desc}>{resolvedDesc}</p> : null}
      {action !== undefined ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}
