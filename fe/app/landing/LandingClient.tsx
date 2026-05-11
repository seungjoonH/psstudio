"use client";

// AppShell 안에서 짧은 카피, 예시 UI 더미, 스크롤 리빌을 구성합니다.
import Link from "next/link";
import { useI18n } from "../../src/i18n/I18nProvider";
import { buildCls } from "../../src/lib/buildCls";
import { AppShell } from "../../src/shell/AppShell";
import btnStyles from "../../src/ui/Button.module.css";
import styles from "./landing.module.css";
import {
  FeatureBand,
  LandingFlowStrip,
  LandingHeroDecor,
  MiniAiPanel,
  MiniAssignmentShowcase,
  MiniCalendar,
  MiniCohortReportShowcase,
  MiniDiffReview,
  MiniHomeKanban,
  MiniNotifyList,
  RoleGlyph,
} from "./LandingVisualMockups";
import { ScrollReveal } from "./ScrollReveal";

const LOGIN_HREF = "/login";
const INVITE_LOGIN_HREF = "/login?next=%2Fjoin-by-code";

const FEATURE_STAGGER_MS = 72;
const ROLE_STAGGER_MS = 55;

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

  const flowSteps = [
    { step: "1", icon: "userPlus" as const, label: t("landing.flowChip1") },
    { step: "2", icon: "book" as const, label: t("landing.flowChip2") },
    { step: "3", icon: "check" as const, label: t("landing.flowChip3") },
    { step: "4", icon: "sparkles" as const, label: t("landing.flowChip4") },
  ];

  const roleCards = [
    { icon: "user" as const, titleKey: "landing.roleOwnerTitle", leadKey: "landing.roleOwnerLead" },
    { icon: "users" as const, titleKey: "landing.roleManagerTitle", leadKey: "landing.roleManagerLead" },
    { icon: "compass" as const, titleKey: "landing.roleMemberTitle", leadKey: "landing.roleMemberLead" },
  ];

  const featureBands = [
    {
      reverse: false as boolean | undefined,
      mock: <MiniAssignmentShowcase ariaLabel={t("landing.mockupAssignmentsAria")} />,
      titleKey: "landing.featureAssignmentTitle",
      leadKey: "landing.featureAssignmentLead",
    },
    {
      reverse: true,
      mock: <MiniCalendar ariaLabel={t("landing.mockupCalendarAria")} />,
      titleKey: "landing.featureCalendarTitle",
      leadKey: "landing.featureCalendarLead",
    },
    {
      reverse: false,
      mock: <MiniDiffReview ariaLabel={t("landing.mockupReviewAria")} />,
      titleKey: "landing.featureReviewTitle",
      leadKey: "landing.featureReviewLead",
    },
    {
      reverse: true,
      mock: <MiniAiPanel ariaLabel={t("landing.mockupAiAria")} />,
      titleKey: "landing.featureAiFeedbackTitle",
      leadKey: "landing.featureAiFeedbackLead",
    },
    {
      reverse: false,
      mock: <MiniCohortReportShowcase ariaLabel={t("landing.mockupCohortAria")} />,
      titleKey: "landing.featureCohortTitle",
      leadKey: "landing.featureCohortLead",
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
                <MiniNotifyList ariaLabel={t("landing.mockupHeroNotifyAria")} />
                <div className={styles.heroDashRow}>
                  <LandingHeroDecor />
                  <MiniHomeKanban ariaLabel={t("landing.mockupHomeKanbanAria")} />
                </div>
              </div>
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-labelledby="landing-roles-title">
            <ScrollReveal delayMs={40}>
              <h2 id="landing-roles-title" className={styles.blockTitle}>
                {t("landing.rolesTitle")}
              </h2>
            </ScrollReveal>
            <div className={styles.roleGrid}>
              {roleCards.map((card, i) => (
                <ScrollReveal key={card.titleKey} delayMs={i * ROLE_STAGGER_MS}>
                  <article className={styles.roleCard}>
                    <RoleGlyph icon={card.icon} />
                    <div className={styles.roleBody}>
                      <h3 className={styles.cardHeading}>{t(card.titleKey)}</h3>
                      <p className={styles.muted}>{t(card.leadKey)}</p>
                    </div>
                  </article>
                </ScrollReveal>
              ))}
            </div>
          </section>

          <section className={styles.surface} aria-labelledby="landing-features-title">
            <ScrollReveal>
              <h2 id="landing-features-title" className={styles.blockTitle}>
                {t("landing.featuresTitle")}
              </h2>
            </ScrollReveal>
            <div className={styles.featureStack}>
              {featureBands.map((band, i) => (
                <ScrollReveal key={band.titleKey} delayMs={i * FEATURE_STAGGER_MS}>
                  <FeatureBand
                    reverse={band.reverse}
                    mock={band.mock}
                    title={t(band.titleKey)}
                    lead={t(band.leadKey)}
                  />
                </ScrollReveal>
              ))}
            </div>
          </section>

          <section className={styles.surface} aria-labelledby="landing-flow-title">
            <ScrollReveal>
              <h2 id="landing-flow-title" className={styles.blockTitle}>
                {t("landing.flowTitle")}
              </h2>
              <LandingFlowStrip ariaLabel={t("landing.flowStripAria")} steps={flowSteps} />
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-labelledby="landing-trust-title">
            <ScrollReveal>
              <h2 id="landing-trust-title" className={styles.blockTitle}>
                {t("landing.trustTitle")}
              </h2>
              <p className={styles.trustLead}>{t("landing.trustLead")}</p>
              <p className={styles.trustBeta}>{t("landing.trustBeta")}</p>
            </ScrollReveal>
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
