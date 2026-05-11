"use client";

// 내 정보 화면의 표시 문자열을 현재 언어 설정에 맞게 렌더링합니다.
import type { MeResponse } from "@psstudio/shared";
import { useState } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { SegmentedControl } from "../../src/ui/SegmentedControl";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { SubmitButton } from "../../src/ui/SubmitButton";
import { Modal } from "../../src/ui/Modal";
import { UserAvatar } from "../../src/ui/UserAvatar";
import { useTheme, type ThemePreference } from "../../src/theme/ThemeProvider";
import styles from "./page.module.css";

type MeClientProps = {
  me: MeResponse;
  handleNicknameUpdate: (formData: FormData) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleDelete: () => Promise<void>;
};

export function MeClient({ me, handleNicknameUpdate, handleLogout, handleDelete }: MeClientProps) {
  const { t, locale, setLocale } = useI18n();
  const { preference, setPreference } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const providerLabel = me.provider === "google" ? "Google" : me.provider === "github" ? "GitHub" : me.provider;

  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <UserAvatar
          nickname={me.nickname}
          imageUrl={me.profileImageUrl}
          size={88}
          className={styles.avatar}
        />
        <div className={styles.heroBody}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{me.nickname}</h1>
            <Badge tone="neutral">{providerLabel}</Badge>
          </div>
          <p className={styles.email}>{me.email}</p>
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t("me.profileCard.title")}</h2>
          <p className={styles.cardLead}>{t("me.profileCard.lead")}</p>
        </header>
        <form action={handleNicknameUpdate} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("me.nicknameEdit")}</span>
            <input
              id="nickname"
              name="nickname"
              defaultValue={me.nickname}
              maxLength={50}
              className={styles.input}
            />
          </label>
          <div className={styles.formActions}>
            <SubmitButton variant="primary">
              {t("me.saveNickname")}
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t("me.systemCard.title")}</h2>
          <p className={styles.cardLead}>{t("me.systemCard.lead")}</p>
        </header>
        <div className={styles.systemGrid}>
          <div className={styles.systemField}>
            <span className={styles.fieldLabel}>{t("common.theme")}</span>
            <SegmentedControl
              name="themePreference"
              defaultValue={preference}
              value={preference}
              onValueChange={(v) => setPreference(v as ThemePreference)}
              className={styles.systemSegment}
              aria-label={t("common.theme")}
              options={[
                { value: "system", label: t("common.system") },
                { value: "light", label: t("common.light") },
                { value: "dark", label: t("common.dark") },
              ]}
            />
          </div>
          <div className={styles.systemField}>
            <span className={styles.fieldLabel}>{t("common.language")}</span>
            <SegmentedControl
              name="uiLanguage"
              defaultValue={locale}
              value={locale}
              onValueChange={(v) => setLocale(v as "ko" | "en")}
              className={styles.systemSegment}
              aria-label={t("common.language")}
              options={[
                { value: "ko", label: t("common.korean") },
                { value: "en", label: t("common.english") },
              ]}
            />
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t("me.accountCard.title")}</h2>
          <p className={styles.cardLead}>{t("me.accountCard.lead")}</p>
        </header>
        <div className={styles.accountRow}>
          <form action={handleLogout}>
            <SubmitButton variant="secondary">{t("me.logout")}</SubmitButton>
          </form>
          <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
            {t("me.deleteAccount")}
          </Button>
        </div>
      </section>

      <Modal
        open={confirmDelete}
        title={t("me.deleteAccount")}
        onClose={() => setConfirmDelete(false)}
        footer={
          <div className={styles.modalFooter}>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <form action={handleDelete}>
              <SubmitButton variant="danger">
                {t("me.deleteModal.confirm")}
              </SubmitButton>
            </form>
          </div>
        }
      >
        <p className={styles.confirmBody}>
          {t("me.deleteModal.body", { provider: providerLabel, email: me.email })}
        </p>
      </Modal>
    </div>
  );
}
