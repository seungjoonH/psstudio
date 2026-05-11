"use client";

// 랜딩 상단·하단 CTA에서 열리는 초대 코드 가입 모달입니다.
import { useActionState } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { Icon } from "../../src/ui/Icon";
import { Modal } from "../../src/ui/Modal";
import { SubmitButton } from "../../src/ui/SubmitButton";
import { joinByCodeAction, type JoinByCodeActionState } from "../join-by-code/actions";
import styles from "./LandingInviteModal.module.css";

type Props = {
  onClose: () => void;
};

export function LandingInviteModal({ onClose }: Props) {
  const { t, locale } = useI18n();
  const [state, formAction] = useActionState(joinByCodeAction, undefined as JoinByCodeActionState);

  return (
    <Modal open title={t("joinByCode.title")} onClose={onClose}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <div className={styles.iconWrap} aria-hidden>
            <Icon name="key" size={22} />
          </div>
          <div className={styles.headText}>
            <p className={styles.headTitle}>{t("joinByCode.title")}</p>
            <p className={styles.headDesc}>{t("joinByCode.desc")}</p>
          </div>
        </div>
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="_locale" value={locale} />
          {state?.error ? (
            <p className={styles.error} role="alert">
              {state.error}
            </p>
          ) : null}
          <input
            name="code"
            maxLength={8}
            minLength={8}
            pattern="[A-Za-z0-9]{8}"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t("joinByCode.placeholder")}
            className={styles.input}
            aria-label={t("joinByCode.label")}
          />
          <SubmitButton variant="primary" className={styles.submit}>
            {t("joinByCode.submit")}
          </SubmitButton>
        </form>
      </div>
    </Modal>
  );
}
