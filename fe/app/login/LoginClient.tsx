"use client";

// 로그인 화면의 OAuth 진입 버튼을 렌더링합니다.
import { useI18n } from "../../src/i18n/I18nProvider";
import { Icon } from "../../src/ui/Icon";
import styles from "./page.module.css";

const oauthIconSize = 20;

export function LoginClient({ apiBase }: { apiBase: string }) {
  const { t } = useI18n();

  return (
    <section className={styles.root}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("login.title")}</h1>
        <p className={styles.description}>{t("login.description")}</p>
        <div className={styles.actions}>
          <a className={styles.button} href={`${apiBase}/api/v1/auth/oauth/google/start`}>
            <Icon name="google" size={oauthIconSize} className={styles.oauthIcon} />
            {t("login.google")}
          </a>
          <a className={styles.button} href={`${apiBase}/api/v1/auth/oauth/github/start`}>
            <Icon name="github" size={oauthIconSize} className={styles.oauthIcon} />
            {t("login.github")}
          </a>
        </div>
      </section>
    </section>
  );
}
