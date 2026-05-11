"use client";

// 그룹 상세 헤더 우측에 노출되는 그룹 추가·둘러보기 버튼 묶음입니다.
import Link from "next/link";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { Icon } from "../../../src/ui/Icon";
import styles from "./GroupHeaderActions.module.css";

export function GroupHeaderActions() {
  const { t } = useI18n();

  return (
    <div className={styles.root}>
      <Link
        href="/groups/explore"
        className={styles.linkBtn}
        aria-label={t("groups.browse")}
        title={t("groups.browse")}
      >
        <Icon name="externalLink" size={20} />
      </Link>
    </div>
  );
}
