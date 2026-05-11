"use client";

// AppShell 안에서 짧은 카피, 예시 UI 더미, 스크롤 리빌을 구성합니다.
import type { ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "../../src/i18n/I18nProvider";
import { buildCls } from "../../src/lib/buildCls";
import { AppShell } from "../../src/shell/AppShell";
import { BetaTag } from "../../src/ui/BetaTag";
import btnStyles from "../../src/ui/Button.module.css";
import styles from "./landing.module.css";
import {
  FeatureBand,
  MiniAssignmentShowcase,
  MiniCalendar,
  MiniCohortReportShowcase,
  MiniGroupsStrip,
  MiniHomeKanban,
  MiniMergedCodeReviewAi,
  MiniNotifyList,
} from "./LandingVisualMockups";
import { ScrollReveal } from "./ScrollReveal";

const LOGIN_HREF = "/login";
const INVITE_LOGIN_HREF = "/login?next=%2Fjoin-by-code";

const FEATURE_STAGGER_MS = 72;

export function LandingClient() {
  const { t } = useI18n();

  const topActions = (
    <div className={styles.topActions}>
      <Link href={INVITE_LOGIN_HREF} className={buildCls(btnStyles.root, btnStyles.secondary)}>
        {t("landing.ctaInvite")}
      </Link>
      <Link href={LOGIN_HREF} className={buildCls(btnStyles.root, btnStyles.primary)}>
        {t("landing.ctaStart")}
      </Link>
    </div>
  );

  const featureBands: Array<{
    key: string;
    reverse?: boolean;
    mock: ReactNode;
    title: ReactNode;
    lead: string;
  }> = [
    {
      key: "assignments",
      reverse: false,
      mock: <MiniAssignmentShowcase ariaLabel={t("landing.mockupAssignmentsAria")} />,
      title: t("landing.featureAssignmentTitle"),
      lead: t("landing.featureAssignmentLead"),
    },
    {
      key: "calendar",
      reverse: true,
      mock: <MiniCalendar ariaLabel={t("landing.mockupCalendarAria")} />,
      title: t("landing.featureCalendarTitle"),
      lead: t("landing.featureCalendarLead"),
    },
    {
      key: "review-ai",
      reverse: false,
      mock: <MiniMergedCodeReviewAi ariaLabel={t("landing.mockupReviewAiAria")} />,
      title: t("landing.featureReviewAiTitle"),
      lead: t("landing.featureReviewAiLead"),
    },
    {
      key: "cohort",
      reverse: true,
      mock: <MiniCohortReportShowcase ariaLabel={t("landing.mockupCohortAria")} />,
      title: (
        <>
          {t("landing.featureCohortTitle")}{" "}
          <BetaTag label={t("common.betaTag")} />
        </>
      ),
      lead: t("landing.featureCohortLead"),
    },
  ];

  return (
    <>
      <a className={styles.skipNav} href="#landing-main">
        {t("landing.skipNav")}
      </a>
      <AppShell
        titleKey="landing.shellTitle"
        subtitleKey="landing.shellSubtitle"
        actions={topActions}
      >
        <div id="landing-main" className={styles.stack}>
          <section className={styles.surface} aria-labelledby="landing-hero-title">
            <ScrollReveal>
              <div className={styles.heroVertical}>
                <div className={styles.heroIntro}>
                  <p className={styles.eyebrow}>{t("landing.heroEyebrow")}</p>
                  <h2 id="landing-hero-title" className={styles.heroTitle}>
                    {t("landing.heroTitle")}
                  </h2>
                  <p className={styles.lead}>{t("landing.heroLead")}</p>
                </div>
                <div className={styles.heroKanbanWrap}>
                  <MiniHomeKanban ariaLabel={t("landing.mockupHomeKanbanAria")} />
                </div>
                <div className={styles.heroNotifyFull} aria-labelledby="landing-notify-full-title">
                  <div className={styles.heroNotifyHead}>
                    <h3 id="landing-notify-full-title" className={styles.heroNotifyTitle}>
                      {t("home.recent.notifications.title")}
                    </h3>
                    <span className={styles.heroNotifyViewAll} tabIndex={-1} aria-hidden>
                      {t("home.recent.notifications.viewAll")}
                    </span>
                  </div>
                  <p className={styles.mockDisclaimer}>{t("landing.mockNotifyDisclaimer")}</p>
                  <MiniNotifyList ariaLabel={t("landing.mockupHeroNotifyAria")} />
                </div>
              </div>
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-label={t("landing.mockupGroupsAria")}>
            <ScrollReveal delayMs={40}>
              <MiniGroupsStrip ariaLabel={t("landing.mockupGroupsAria")} />
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-labelledby="landing-features-title">
            <ScrollReveal>
              <h2 id="landing-features-title" className={styles.blockTitle}>
                {t("landing.featuresTitle")}
              </h2>
            </ScrollReveal>
            <div className={styles.featureStack}>
              {featureBands.map((band, i) => (
                <ScrollReveal key={band.key} delayMs={i * FEATURE_STAGGER_MS}>
                  <FeatureBand reverse={band.reverse} mock={band.mock} title={band.title} lead={band.lead} />
                </ScrollReveal>
              ))}
            </div>
          </section>

          <section className={styles.surfaceMuted} aria-labelledby="landing-bottom-cta-title">
            <ScrollReveal>
              <h2 id="landing-bottom-cta-title" className={styles.blockTitle}>
                {t("landing.bottomCtaTitle")}
              </h2>
              <p className={styles.leadTight}>{t("landing.bottomCtaSubtitle")}</p>
              <div className={styles.inlineCtas}>
                <Link href={LOGIN_HREF} className={buildCls(btnStyles.root, btnStyles.primary)}>
                  {t("landing.ctaStart")}
                </Link>
                <Link href={INVITE_LOGIN_HREF} className={buildCls(btnStyles.root, btnStyles.secondary)}>
                  {t("landing.ctaInvite")}
                </Link>
              </div>
            </ScrollReveal>
          </section>

          <ScrollReveal>
            <p className={styles.footerNote}>{t("landing.footerNote")}</p>
          </ScrollReveal>
        </div>
      </AppShell>
    </>
  );
}
