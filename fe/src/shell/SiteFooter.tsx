"use client";

// 전역 푸터에 저작권 문구와 운영자 이메일을 표시합니다.
import { useMemo } from "react";
import { SITE_CONTACT_EMAIL } from "../config/siteContact";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  const { t } = useI18n();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer className={styles.root} role="contentinfo">
      <p className={styles.line}>{t("shell.siteFooterRights", { year })}</p>
      <p className={styles.line}>
        <a href={`mailto:${SITE_CONTACT_EMAIL}`} className={styles.mail}>
          {SITE_CONTACT_EMAIL}
        </a>
      </p>
    </footer>
  );
}
