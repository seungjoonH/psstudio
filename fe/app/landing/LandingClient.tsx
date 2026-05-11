"use client";

// AppShell 안에서 짧은 카피, 예시 UI 더미, 스크롤 리빌을 구성합니다.
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { buildCls } from "../../src/lib/buildCls";
import { AppShell } from "../../src/shell/AppShell";
import { BetaTag } from "../../src/ui/BetaTag";
import btnStyles from "../../src/ui/Button.module.css";
import styles from "./landing.module.css";
import {
  FeatureBand,
  LANDING_NOTIFY_LIST_ANCHOR_ID,
  LandingReviewAiMockProvider,
  MiniAssignmentShowcase,
  MiniCalendar,
  MiniCohortReportShowcase,
  MiniGroupsStrip,
  MiniHomeKanban,
  MiniMergedCodeReviewAi,
  MiniMergedCodeReviewAiTrigger,
  MiniNotifyList,
} from "./LandingVisualMockups";
import { LandingHeroTitle } from "./LandingHeroTitle";
import { LandingInviteModal } from "./LandingInviteModal";
import { ScrollReveal } from "./ScrollReveal";

const LOGIN_NEXT_HOME = "/login?next=%2F";
const LOGIN_NEXT_JOIN = "/login?next=%2Fjoin-by-code";
const HOME_HREF = "/";

const FEATURE_STAGGER_MS = 72;

export function LandingClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useI18n();
  const tourTargetRef = useRef<HTMLElement>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const handleInviteClick = useCallback(() => setInviteOpen(true), []);

  // "둘러보기" 클릭 시 첫 mockup 섹션으로 부드럽게 자동 스크롤하고, 도중에
  // viewport에 들어오는 섹션은 기존 ScrollReveal이 fade-in을 트리거합니다.
  const handleExploreTour = useCallback(() => {
    tourTargetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const topActions = useMemo(
    () => (
      <div className={styles.topActions}>
        {isLoggedIn ? (
          <button
            type="button"
            className={buildCls(btnStyles.root, btnStyles.secondary)}
            onClick={handleInviteClick}
          >
            {t("landing.ctaInvite")}
          </button>
        ) : (
          <Link href={LOGIN_NEXT_JOIN} className={buildCls(btnStyles.root, btnStyles.secondary)}>
            {t("landing.ctaInvite")}
          </Link>
        )}
        {isLoggedIn ? (
          <Link href={HOME_HREF} className={buildCls(btnStyles.root, btnStyles.primary)}>
            {t("landing.ctaStart")}
          </Link>
        ) : (
          <Link href={LOGIN_NEXT_HOME} className={buildCls(btnStyles.root, btnStyles.primary)}>
            {t("landing.ctaStart")}
          </Link>
        )}
      </div>
    ),
    [handleInviteClick, isLoggedIn, t],
  );

  const featureBands: Array<{
    key: string;
    reverse?: boolean;
    mock: ReactNode;
    title: ReactNode;
    lead: string;
    textFooter?: ReactNode;
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
      mock: <MiniMergedCodeReviewAi omitAiTrigger ariaLabel={t("landing.mockupReviewAiAria")} />,
      title: t("landing.featureReviewAiTitle"),
      lead: t("landing.featureReviewAiLead"),
      textFooter: <MiniMergedCodeReviewAiTrigger />,
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
      <AppShell titleKey="landing.shellTitle" actions={topActions}>
        <div id="landing-main" className={styles.stack}>
          <section
            className={buildCls(styles.surface, styles.introSurface)}
            aria-labelledby="landing-hero-title"
          >
            <ScrollReveal>
              <p className={styles.eyebrow}>{t("landing.heroEyebrow")}</p>
              <LandingHeroTitle className={styles.introHeadline} />
              <p className={styles.introLead}>{t("landing.heroLead")}</p>
              <div className={styles.heroActions}>
                <button
                  type="button"
                  className={buildCls(btnStyles.root, btnStyles.secondary)}
                  onClick={handleExploreTour}
                >
                  {t("landing.heroExploreCta")}
                </button>
              </div>
            </ScrollReveal>
          </section>

          <section
            ref={tourTargetRef}
            className={styles.kanbanSection}
            aria-labelledby="landing-kanban-mock-title"
          >
            <ScrollReveal delayMs={40}>
              <h2 id="landing-kanban-mock-title" className={styles.srOnly}>
                {t("landing.mockupHomeKanbanAria")}
              </h2>
              <div className={styles.kanbanCard}>
                <MiniHomeKanban ariaLabel={t("landing.mockupHomeKanbanAria")} />
              </div>
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-labelledby={LANDING_NOTIFY_LIST_ANCHOR_ID}>
            <ScrollReveal delayMs={40}>
              <div className={styles.notifyShowcase}>
                <MiniNotifyList
                  ariaLabel={t("landing.mockupHeroNotifyAria")}
                  heroTitleId={LANDING_NOTIFY_LIST_ANCHOR_ID}
                />
              </div>
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-labelledby="landing-groups-title">
            <ScrollReveal delayMs={40}>
              <div className={styles.groupsShowcase}>
                <h2 id="landing-groups-title" className={styles.blockTitle}>
                  {t("landing.groupsShowcaseTitle")}
                </h2>
                <p className={styles.lead}>{t("landing.groupsShowcaseLead")}</p>
                <MiniGroupsStrip ariaLabel={t("landing.mockupGroupsAria")} />
              </div>
            </ScrollReveal>
          </section>

          <section className={styles.surface} aria-labelledby="landing-features-title">
            <ScrollReveal>
              <h2 id="landing-features-title" className={styles.blockTitle}>
                {t("landing.featuresTitle")}
              </h2>
            </ScrollReveal>
            <div className={styles.featureStack}>
              {featureBands.flatMap((band, i) => {
                const delayMs = i * FEATURE_STAGGER_MS;
                const bandInner = (
                  <FeatureBand
                    reverse={band.reverse}
                    mock={band.mock}
                    title={band.title}
                    lead={band.lead}
                    textFooter={band.textFooter}
                    wideCalendarMock={band.key === "calendar"}
                  />
                );
                const bandNode =
                  band.key === "review-ai" ? (
                    <LandingReviewAiMockProvider>
                      {bandInner}
                    </LandingReviewAiMockProvider>
                  ) : (
                    bandInner
                  );
                return [
                  <ScrollReveal key={band.key} delayMs={delayMs}>
                    {bandNode}
                  </ScrollReveal>,
                ];
              })}
            </div>
          </section>

          <section
            className={buildCls(styles.surfaceMuted, styles.bottomCtaBeforeFooter)}
            aria-labelledby="landing-bottom-cta-title"
          >
            <ScrollReveal>
              <h2 id="landing-bottom-cta-title" className={styles.blockTitle}>
                {t("landing.bottomCtaTitle")}
              </h2>
              <p className={styles.leadTight}>{t("landing.bottomCtaSubtitle")}</p>
              <div className={styles.inlineCtas}>
                {isLoggedIn ? (
                  <button
                    type="button"
                    className={buildCls(btnStyles.root, btnStyles.secondary)}
                    onClick={handleInviteClick}
                  >
                    {t("landing.ctaInvite")}
                  </button>
                ) : (
                  <Link href={LOGIN_NEXT_JOIN} className={buildCls(btnStyles.root, btnStyles.secondary)}>
                    {t("landing.ctaInvite")}
                  </Link>
                )}
                {isLoggedIn ? (
                  <Link href={HOME_HREF} className={buildCls(btnStyles.root, btnStyles.primary)}>
                    {t("landing.ctaBottomPrimary")}
                  </Link>
                ) : (
                  <Link href={LOGIN_NEXT_HOME} className={buildCls(btnStyles.root, btnStyles.primary)}>
                    {t("landing.ctaBottomPrimary")}
                  </Link>
                )}
              </div>
            </ScrollReveal>
          </section>
        </div>
      </AppShell>
      {inviteOpen ? <LandingInviteModal onClose={() => setInviteOpen(false)} /> : null}
    </>
  );
}
