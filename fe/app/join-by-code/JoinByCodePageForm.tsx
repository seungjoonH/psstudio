"use client";

// 초대 코드 입력 가입 페이지의 폼 본문을 i18n 적용해 렌더링합니다.
import { useActionState } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { SubmitButton } from "../../src/ui/SubmitButton";
import { joinByCodeAction, type JoinByCodeActionState } from "./actions";
import styles from "./page.module.css";

export function JoinByCodePageForm() {
  const { t, locale } = useI18n();
  const [state, formAction] = useActionState(joinByCodeAction, undefined as JoinByCodeActionState);
  return (
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
        placeholder={t("joinByCode.pagePlaceholder")}
        className={styles.input}
      />
      <SubmitButton variant="primary">
        {t("joinByCode.pageSubmit")}
      </SubmitButton>
    </form>
  );
}
