"use client";

// 랜딩 히어로 제목에서 핵심 단어(과제·리뷰)만 그라데이션과 미세 모션으로 강조합니다.
import { useI18n } from "../../src/i18n/I18nProvider";
import styles from "./landing.module.css";

type LandingHeroTitleProps = {
  className: string;
};

export function LandingHeroTitle({ className }: LandingHeroTitleProps) {
  const { t } = useI18n();
  return (
    <h2 id="landing-hero-title" className={className}>
      <span className={styles.heroTitleSegment}>{t("landing.heroTitleLead")}</span>
      <span className={styles.heroGlowAssign}>{t("landing.heroTitleWordAssign")}</span>
      <span className={styles.heroTitleSegment}>{t("landing.heroTitleBridge1")}</span>
      <span className={styles.heroGlowReview}>{t("landing.heroTitleWordReview")}</span>
      <span className={styles.heroTitleSegment}>{t("landing.heroTitleTail")}</span>
    </h2>
  );
}
