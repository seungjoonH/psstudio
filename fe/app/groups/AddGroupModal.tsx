"use client";

// 새 그룹 만들기와 초대 코드 가입을 한 모달에 묶어 노출합니다.
import Link from "next/link";
import { useActionState } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { SubmitButton } from "../../src/ui/SubmitButton";
import { Icon } from "../../src/ui/Icon";
import { Modal } from "../../src/ui/Modal";
import { joinByCodeAction, type JoinByCodeActionState } from "../join-by-code/actions";
import styles from "./AddGroupModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddGroupModal({ open, onClose }: Props) {
  const { t, locale } = useI18n();
  const [joinState, joinFormAction] = useActionState(joinByCodeAction, undefined as JoinByCodeActionState);
  return (
    <Modal open={open} title={t("groupsAdd.title")} onClose={onClose}>
      <div className={styles.root}>
        <Link href="/groups/new" className={styles.createCta} onClick={onClose}>
          <span className={styles.createIcon} aria-hidden>
            <Icon name="plus" size={20} />
          </span>
          <span className={styles.createBody}>
            <span className={styles.createTitle}>{t("groupsAdd.createTitle")}</span>
            <span className={styles.createDesc}>{t("groupsAdd.createDesc")}</span>
          </span>
          <Icon name="chevronRight" size={18} className={styles.createArrow} />
        </Link>

        <div className={styles.divider}>
          <span>{t("common.or")}</span>
        </div>

        <section className={styles.joinSection} aria-label={t("groupsAdd.joinTitle")}>
          <header className={styles.joinHeader}>
            <span className={styles.joinIcon} aria-hidden>
              <Icon name="key" size={16} />
            </span>
            <div>
              <h3 className={styles.joinTitle}>{t("groupsAdd.joinTitle")}</h3>
              <p className={styles.joinDesc}>{t("groupsAdd.joinDesc")}</p>
            </div>
          </header>
          <form action={joinFormAction} className={styles.joinForm}>
            <input type="hidden" name="_locale" value={locale} />
            {joinState?.error ? (
              <p className={styles.joinError} role="alert">
                {joinState.error}
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
      </div>
    </Modal>
  );
}
