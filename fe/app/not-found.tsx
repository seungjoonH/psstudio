"use client";

// 앱 전역 404 화면을 렌더링합니다.
import Link from "next/link";
import { useI18n } from "../src/i18n/I18nProvider";
import { buildCls } from "../src/lib/buildCls";
import { AppShell } from "../src/shell/AppShell";
import buttonStyles from "../src/ui/Button.module.css";
import styles from "./not-found.module.css";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <AppShell title={t("notFound.shellTitle")} subtitle={t("notFound.shellSubtitle")}>
      <section className={styles.wrap}>
        <div className={styles.panel}>
          <span className={styles.code}>404</span>
          <h2 className={styles.title}>{t("notFound.title")}</h2>
          <p className={styles.description}>{t("notFound.description")}</p>
          <div className={styles.actions}>
            <Link href="/" className={buildCls(buttonStyles.root, buttonStyles.primary, styles.actionLink)}>
              {t("notFound.goHome")}
            </Link>
            <Link
              href="/assignments"
              className={buildCls(buttonStyles.root, buttonStyles.secondary, styles.actionLink)}
            >
              {t("notFound.goAssignments")}
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
