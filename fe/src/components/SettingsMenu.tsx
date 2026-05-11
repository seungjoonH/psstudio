"use client";

// 헤더 우측 설정 아이콘 링크입니다.
import Link from "next/link";
import { useI18n } from "../i18n/I18nProvider";
import { Icon } from "../ui/Icon";
import styles from "./SettingsMenu.module.css";

export function SettingsMenu() {
  const { t } = useI18n();

  return (
    <Link href="/me" className={styles.iconButton} aria-label={t("shell.settings")} title={t("shell.settings")}>
      <span aria-hidden>
        <Icon name="settings" />
      </span>
    </Link>
  );
}
