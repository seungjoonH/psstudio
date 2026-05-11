"use client";

// 초대 링크 진입 화면의 텍스트와 버튼을 i18n 적용해 렌더링합니다.
import Link from "next/link";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { SubmitButton } from "../../../src/ui/SubmitButton";
import styles from "./page.module.css";

type Props = {
  groupName: string;
  acceptAction: (formData: FormData) => Promise<void>;
  token: string;
};

export function InviteLandingClient({ groupName, acceptAction, token }: Props) {
  const { t } = useI18n();
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>{groupName}</h2>
      <p className={styles.meta}>{t("invite.link.note")}</p>
      <form action={acceptAction}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton variant="primary">
          {t("invite.link.join")}
        </SubmitButton>
      </form>
      <p className={styles.footer}>
        <Link href="/groups">{t("invite.link.list")}</Link>
      </p>
    </div>
  );
}
