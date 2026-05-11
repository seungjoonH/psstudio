"use client";

// 과제 상세 화면을 2열 레이아웃과 그룹 제출 사이드바로 렌더링합니다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dueBadgeTone } from "../../../../../src/lib/dueBadgeTone";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../../../src/i18n/I18nProvider";
import type { AssignmentDto, CohortAnalysisDto } from "../../../../../src/assignments/server";
import type { SubmissionListItemDto } from "../../../../../src/submissions/server";
import { AppShell } from "../../../../../src/shell/AppShell";
import { Badge } from "../../../../../src/ui/Badge";
import { BetaTag } from "../../../../../src/ui/BetaTag";
import { DifficultyBadge } from "../../../../../src/ui/DifficultyBadge";
import { Icon } from "../../../../../src/ui/Icon";
import { UserAvatar } from "../../../../../src/ui/UserAvatar";
import { GroupSubnavCluster } from "../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../GroupRouteBreadcrumbs";
import { getCohortAnalysisStateAction, startCohortAnalysisAction } from "../actions";
import styles from "./AssignmentDetailClient.module.css";

type Props = {
  groupId: string;
  groupName: string;
  assignmentId: string;
  assignment: AssignmentDto;
  canManage: boolean;
  meId: string;
  submissions: SubmissionListItemDto[];
  submissionSort: "createdAtAsc" | "createdAtDesc";
  cohortInitial: CohortAnalysisDto;
};

function sameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatRemainingHms(ms: number): string {
  const secTotal = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(secTotal / 3600);
  const m = Math.floor((secTotal % 3600) / 60);
  const s = secTotal % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatProblemRef(problemUrl: string, platform: string): string {
  try {
    const u = new URL(problemUrl);
    const host = u.hostname;
    if (host.includes("programmers")) {
      const m = u.pathname.match(/lessons\/(\d+)/);
      return m !== null ? `${platform} · ${m[1]}` : platform;
    }
    if (host.includes("acmicpc")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      return id !== undefined ? `${platform} ${id}` : platform;
    }
    if (host.includes("leetcode")) {
      const segs = u.pathname.split("/").filter(Boolean);
      const slug = segs[1];
      return slug !== undefined ? `${platform} · ${slug}` : platform;
    }
  } catch {
    /* ignore */
  }
  return platform;
}

export function AssignmentDetailClient({
  groupId,
  groupName,
  assignmentId,
  assignment,
  canManage,
  meId,
  submissions,
  submissionSort,
  cohortInitial,
}: Props) {
  const { t, locale: uiLocale } = useI18n();
  const router = useRouter();
  const a = assignment;
  const due = new Date(a.dueAt);
  const assignmentBase = `/groups/${groupId}/assignments/${assignmentId}`;
  const submissionsBase = `${assignmentBase}/submissions`;
  const mine = submissions.find((s) => s.authorUserId === meId);
  const hasSubmitted = mine !== undefined;
  const [showDueAt, setShowDueAt] = useState(false);
  const [showHintTemporarily, setShowHintTemporarily] = useState(false);
  const [showAlgorithmsTemporarily, setShowAlgorithmsTemporarily] = useState(false);
  const [cohort, setCohort] = useState<CohortAnalysisDto>(cohortInitial);
  const [cohortErr, setCohortErr] = useState<string | null>(null);
  const [cohortStarting, setCohortStarting] = useState(false);
  const [autoMoveToCohortPage, setAutoMoveToCohortPage] = useState(false);
  const [deadlineTick, setDeadlineTick] = useState(0);

  const duePassed = Date.now() >= due.getTime();
  const cohortCountOk = submissions.length >= 2;

  void deadlineTick;
  const now = Date.now();
  const onDueLocalDay = sameLocalCalendarDay(due, new Date(now));
  const msUntilDue = due.getTime() - now;
  const showSidebarDeadlineCountdown =
    a.allowLateSubmission && onDueLocalDay && msUntilDue > 0;
  const submitSidebarBlocked = !a.allowLateSubmission && duePassed;
  const submitSidebarSolvedAfterDeadline =
    duePassed && a.allowLateSubmission && hasSubmitted;
  const submitSidebarLabel =
    a.allowLateSubmission && duePassed && !hasSubmitted
      ? t("assignment.detail.sidebarSubmitLate")
      : t("submission.list.new");

  useEffect(() => {
    if (!showSidebarDeadlineCountdown) return;
    const id = window.setInterval(() => {
      setDeadlineTick((x) => x + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [showSidebarDeadlineCountdown]);

  useEffect(() => {
    if (cohort.status !== "RUNNING") return;
    const id = window.setInterval(() => {
      void getCohortAnalysisStateAction(assignmentId)
        .then(setCohort)
        .catch(() => {
          /* 폴링 실패는 무시 */
        });
    }, 3000);
    return () => window.clearInterval(id);
  }, [cohort.status, assignmentId]);

  useEffect(() => {
    if (!autoMoveToCohortPage) return;
    if (cohort.status === "DONE") {
      router.push(`${assignmentBase}/cohort`);
      return;
    }
    if (cohort.status === "FAILED") {
      setAutoMoveToCohortPage(false);
    }
  }, [autoMoveToCohortPage, cohort.status, router, assignmentBase]);

  const problemRef = formatProblemRef(a.problemUrl, a.platform);
  const daysLeft = useMemo(() => Math.max(0, Math.ceil((due.getTime() - Date.now()) / (24 * 3600 * 1000))), [due]);
  const dueLabel = a.isLate ? t("assignment.list.late") : `D-${daysLeft}`;
  const dueTone = dueBadgeTone(a.isLate, daysLeft);
  const hintHiddenUntilSubmit = a.metadata.hintHiddenUntilSubmit ?? true;
  const algorithmsHiddenUntilSubmit = a.metadata.algorithmsHiddenUntilSubmit ?? true;
  const canSeeHint = hasSubmitted || !hintHiddenUntilSubmit || showHintTemporarily;
  const canSeeAlgorithms = hasSubmitted || !algorithmsHiddenUntilSubmit || showAlgorithmsTemporarily;

  const showCohortAction =
    duePassed &&
    cohortCountOk &&
    (cohort.status === "NONE" || cohort.status === "FAILED" || cohort.status === "RUNNING");
  const cohortActionBusy = cohortStarting || cohort.status === "RUNNING";

  async function handleStartCohort() {
    setCohortErr(null);
    setCohortStarting(true);
    try {
      const next = await startCohortAnalysisAction(groupId, assignmentId, uiLocale);
      setCohort(next);
      if (next.status === "DONE") {
        router.push(`${assignmentBase}/cohort`);
      } else if (next.status === "RUNNING") {
        setAutoMoveToCohortPage(true);
      } else {
        setAutoMoveToCohortPage(false);
      }
    } catch (e) {
      setCohortErr((e as Error).message);
      setAutoMoveToCohortPage(false);
    } finally {
      setCohortStarting(false);
    }
  }

  return (
    <AppShell
      title={`${groupName} ${t("groupNav.assignments")}`}
      subtitleKey="assignment.list.subtitle"
    >
      <GroupSubnavCluster groupId={groupId}>
        <GroupRouteBreadcrumbs groupId={groupId} assignmentTitle={a.title} />
      </GroupSubnavCluster>
      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <section className={styles.heroCard}>
            <div className={styles.titleRow}>
              <h2 className={styles.assignmentTitle}>{a.title}</h2>
              <div className={styles.heroActionRow}>
                <a
                  href={a.problemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.iconActionBtn}
                  aria-label={t("assignment.detail.openProblem")}
                  title={t("assignment.detail.openProblem")}
                >
                  <Icon name="externalLink" size={18} />
                </a>
                {canManage ? (
                  <Link
                    href={`${assignmentBase}/settings`}
                    className={styles.iconActionBtn}
                    aria-label={t("assignment.detail.settings")}
                    title={t("assignment.detail.settings")}
                  >
                    <Icon name="settings" size={18} />
                  </Link>
                ) : null}
              </div>
            </div>
            <div className={styles.heroTop}>
              <div className={styles.badgeRow}>
                <Badge tone="neutral" chipIndex={1}>
                  {a.platform}
                </Badge>
                <DifficultyBadge platform={a.platform} difficulty={a.difficulty} />
                {canSeeAlgorithms && (a.metadata.algorithms?.length ?? 0) > 0
                  ? a.metadata.algorithms?.map((tag) => (
                      <Badge key={tag} tone="neutral" chipIndex={3}>
                        {tag}
                      </Badge>
                    ))
                  : null}
                {!canSeeAlgorithms && (a.metadata.algorithms?.length ?? 0) > 0 ? (
                  <div className={styles.algorithmsRevealWrap}>
                    <div className={styles.algorithmsBlurUnder} aria-hidden="true">
                      {a.metadata.algorithms?.map((tag) => (
                        <Badge key={tag} tone="neutral" chipIndex={3}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className={styles.blurLockOverlay}>
                      <button
                        type="button"
                        className={`${styles.revealBtn} ${styles.blurLockOverlayBtn}`}
                        onClick={() => setShowAlgorithmsTemporarily(true)}
                      >
                        {t("assignment.detail.revealAlgorithms")}
                      </button>
                    </div>
                  </div>
                ) : null}
                {a.analysisStatus !== "DONE" ? (
                  <Badge tone="warning">
                    {t("assignment.detail.analysisBadge", { status: a.analysisStatus })}
                  </Badge>
                ) : null}
              </div>
              <div className={styles.heroRight}>
                <button
                  type="button"
                  className={styles.dueToggle}
                  onClick={() => {
                    if (!a.isLate) setShowDueAt((v) => !v);
                  }}
                  aria-label={showDueAt ? t("assignment.detail.dueToggleRemain") : t("assignment.detail.dueToggleDate")}
                >
                  <Badge tone={dueTone}>{showDueAt && !a.isLate ? due.toLocaleString() : dueLabel}</Badge>
                </button>
                <Badge tone={mine ? "success" : "danger"}>
                  {mine ? t("assignment.detail.solvedBadge") : t("assignment.detail.unsolvedBadge")}
                </Badge>
              </div>
            </div>
            <p className={styles.problemRef}>{problemRef}</p>

            <div className={styles.myStrip}>
              <div className={styles.myStripHead}>{t("assignment.detail.mySubmissionHeading")}</div>
              <div className={styles.myStripBody}>
                {mine !== undefined ? (
                  <>
                    <span className={styles.myStripMeta}>
                      {mine.title} · {new Date(mine.updatedAt).toLocaleString()}
                    </span>
                    <Link href={`${submissionsBase}/${mine.id}`} className={styles.secondaryLinkBtn}>
                      {t("assignment.detail.mySubmissionView")}
                    </Link>
                  </>
                ) : (
                  <span className={styles.myStripMeta}>{t("assignment.detail.notSubmitted")}</span>
                )}
              </div>
            </div>

          </section>

          {a.hintPlain.length > 0 ? (
            <section className={styles.descCard}>
              <div className={styles.descHead}>
                <h2 className={styles.descHeading}>{t("assignment.detail.hintHeading")}</h2>
              </div>
              <div className={styles.hintRevealWrap}>
                <div
                  className={
                    canSeeHint ? styles.hintContent : `${styles.hintContent} ${styles.hintContentLocked}`
                  }
                  aria-hidden={!canSeeHint}
                >
                  <p className={styles.descBody}>{a.hintPlain}</p>
                </div>
                {!canSeeHint ? (
                  <div className={styles.blurLockOverlay}>
                    <button
                      type="button"
                      className={`${styles.revealBtn} ${styles.blurLockOverlayBtn}`}
                      onClick={() => setShowHintTemporarily(true)}
                    >
                      {t("assignment.detail.revealHint")}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={styles.cohortCard} aria-labelledby="cohort-heading">
            <div className={styles.cohortHead}>
              <h2 id="cohort-heading" className={styles.cohortTitle}>
                {t("assignment.detail.cohort.title")}{" "}
                <BetaTag label={t("common.betaTag")} />
              </h2>
            </div>
            <p className={styles.cohortLead}>{t("assignment.detail.cohort.lead")}</p>
            {!duePassed ? (
              <p className={styles.cohortBlocked}>{t("assignment.detail.cohort.blockedDue")}</p>
            ) : null}
            {duePassed && !cohortCountOk ? (
              <p className={styles.cohortBlocked}>{t("assignment.detail.cohort.blockedCount")}</p>
            ) : null}
            {cohortErr !== null ? <p className={styles.cohortError}>{cohortErr}</p> : null}
            {showCohortAction ? (
              <div className={styles.cohortActionRow}>
                <button
                  type="button"
                  className={styles.cohortPrimaryBtn}
                  disabled={cohortActionBusy}
                  aria-busy={cohortActionBusy}
                  onClick={() => void handleStartCohort()}
                >
                  {cohortActionBusy ? (
                    <>
                      <span className={styles.cohortSpinner} aria-hidden />
                      <span className={styles.srOnly}>{t("assignment.detail.cohort.running")}</span>
                    </>
                  ) : null}
                  {t("assignment.detail.cohort.start")}
                </button>
              </div>
            ) : null}
            {cohort.status === "FAILED" ? (
              <p className={styles.cohortStatus}>
                {t("assignment.detail.cohort.failed")}
                {cohort.failureReason ? ` — ${cohort.failureReason}` : ""}
              </p>
            ) : null}
            {cohort.status === "DONE" ? (
              <div className={styles.cohortDoneRow}>
                <Link href={`${assignmentBase}/cohort`} className={styles.cohortViewFull}>
                  {t("assignment.detail.cohort.viewFull")}
                </Link>
              </div>
            ) : null}
          </section>
        </div>

        <aside>
          <div className={styles.sideCard}>
            <div className={styles.sideHead}>
              <h2 className={styles.sideTitle}>{t("assignment.detail.sidebarTitle")}</h2>
              <span className={styles.sideCount}>{submissions.length}</span>
            </div>
            <div className={styles.sideNewWrap}>
              {submitSidebarBlocked ? (
                <span
                  className={`${styles.sidePrimaryLink} ${styles.sidePrimaryLinkDisabled}`}
                  aria-disabled="true"
                >
                  {t("assignment.detail.sidebarSubmitClosed")}
                </span>
              ) : submitSidebarSolvedAfterDeadline ? (
                <span
                  className={`${styles.sidePrimaryLink} ${styles.sidePrimaryLinkDisabled}`}
                  aria-disabled="true"
                >
                  {t("assignment.detail.sidebarSubmitSolvedComplete")}
                </span>
              ) : (
                <Link href={`${submissionsBase}/new`} className={styles.sidePrimaryLink}>
                  {submitSidebarLabel}
                </Link>
              )}
              {showSidebarDeadlineCountdown ? (
                <p className={styles.sideDeadlineCountdown} aria-live="polite">
                  {t("assignment.detail.sidebarDeadlineCountdown", {
                    time: formatRemainingHms(msUntilDue),
                  })}
                </p>
              ) : null}
            </div>
            <div className={styles.sideToolbar}>
              <Link
                href={`${assignmentBase}?submissionSort=createdAtAsc`}
                className={submissionSort === "createdAtAsc" ? styles.sortTabActive : styles.sortTab}
              >
                {t("submission.list.sortAsc")}
              </Link>
              <Link
                href={`${assignmentBase}?submissionSort=createdAtDesc`}
                className={submissionSort === "createdAtDesc" ? styles.sortTabActive : styles.sortTab}
              >
                {t("submission.list.sortDesc")}
              </Link>
            </div>
            {submissions.length === 0 ? (
              <p className={styles.sideEmpty}>{t("assignment.detail.sidebarEmpty")}</p>
            ) : (
              <ul className={styles.sideList}>
                {submissions.map((s) => (
                  <li key={s.id} className={styles.sideRow}>
                    <Link href={`${submissionsBase}/${s.id}`} className={styles.sideLink}>
                      <div className={styles.sideRowHead}>
                        <div className={styles.sideAuthor}>
                          <UserAvatar
                            nickname={s.authorNickname}
                            imageUrl={s.authorProfileImageUrl}
                            size={28}
                            className={styles.sideAvatar}
                          />
                          <span className={styles.sideName}>{s.authorNickname}</span>
                        </div>
                        <div className={styles.sideMetaBadges}>
                          <Badge tone="neutral" chipIndex={4}>
                            {s.language}
                          </Badge>
                          {s.isLate ? <Badge tone="warning">{t("submission.list.late")}</Badge> : null}
                        </div>
                      </div>
                      <div className={styles.sideTitleLine}>{s.title}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={submissionsBase} className={styles.sideFullLink}>
              {t("assignment.detail.sidebarFullPage")}
            </Link>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
