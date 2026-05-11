"use client";

// 그룹 목록 화면에서 초대 코드로 그룹에 참여하는 카드입니다.
import { useActionState } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { SubmitButton } from "../../src/ui/SubmitButton";
import { Icon } from "../../src/ui/Icon";
import { joinByCodeAction, type JoinByCodeActionState } from "../join-by-code/actions";
import styles from "./JoinByCodeCard.module.css";

type Props = {
  variant?: "card" | "inline";
};

export function JoinByCodeCard({ variant = "card" }: Props) {
  const { t, locale } = useI18n();
  const title = t("joinByCode.title");
  const [state, formAction] = useActionState(joinByCodeAction, undefined as JoinByCodeActionState);
  return (
    <section className={variant === "card" ? styles.card : styles.inline} aria-label={title}>
      <div className={styles.header}>
        <span className={styles.iconWrap} aria-hidden>
          <Icon name="key" size={16} />
        </span>
        <div className={styles.titles}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.hint}>{t("joinByCode.desc")}</p>
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
          spellCheck={false}
          placeholder={t("joinByCode.placeholder")}
          className={styles.input}
          aria-label={t("joinByCode.label")}
        />
        <SubmitButton variant="primary">
          {t("joinByCode.submit")}
        </SubmitButton>
      </form>
    </section>
  );
}
