"use client";

// 과제 상세 화면을 2열 레이아웃과 그룹 제출 사이드바로 렌더링합니다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../../../src/i18n/I18nProvider";
import type { AssignmentDto, CohortAnalysisArtifacts, CohortAnalysisDto } from "../../../../../src/assignments/server";
import type { SubmissionListItemDto } from "../../../../../src/submissions/server";
import { AppShell } from "../../../../../src/shell/AppShell";
import { Badge } from "../../../../../src/ui/Badge";
import { DifficultyBadge } from "../../../../../src/ui/DifficultyBadge";
import { Icon } from "../../../../../src/ui/Icon";
import { UserAvatar } from "../../../../../src/ui/UserAvatar";
import { GroupSubnavCluster } from "../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../GroupRouteBreadcrumbs";
import { MarkdownPreview } from "../../../../../src/ui/MarkdownPreview";
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
  translationLanguage: string;
  cohortInitial: CohortAnalysisDto;
};

function orderedPairIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pickPairwiseDiff(artifacts: CohortAnalysisArtifacts | undefined, x: string, y: string): string {
  if (!artifacts || !x || !y || x === y) return "";
  const [sa, sb] = orderedPairIds(x, y);
  const d = artifacts.pairwiseDiffs.find((p) => p.submissionIdA === sa && p.submissionIdB === sb);
  return d?.diffText ?? "";
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
  translationLanguage,
  cohortInitial,
}: Props) {
  const { t } = useI18n();
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
  const [pickA, setPickA] = useState("");
  const [pickB, setPickB] = useState("");
  const cohortPicksInit = useRef(false);

  const duePassed = Date.now() >= due.getTime();
  const cohortLangOk = translationLanguage !== "none";
  const cohortCountOk = submissions.length >= 2;

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
    if (cohort.status !== "DONE") {
      cohortPicksInit.current = false;
      return;
    }
    const inc = cohort.includedSubmissions ?? [];
    if (inc.length < 2 || cohortPicksInit.current) return;
    cohortPicksInit.current = true;
    setPickA(inc[0].submissionId);
    setPickB(inc[1].submissionId);
  }, [cohort.status, cohort.includedSubmissions]);
  const problemRef = formatProblemRef(a.problemUrl, a.platform);
  const daysLeft = useMemo(() => Math.max(0, Math.ceil((due.getTime() - Date.now()) / (24 * 3600 * 1000))), [due]);
  const dueLabel = a.isLate ? t("assignment.list.late") : `D-${daysLeft}`;
  const dueTone: "neutral" | "warning" | "danger" | "dangerStrong" | "success" = mine
    ? "success"
    : a.isLate
      ? "dangerStrong"
      : daysLeft <= 1
        ? "dangerStrong"
        : daysLeft <= 3
          ? "danger"
          : daysLeft <= 7
            ? "warning"
            : "neutral";
  const hintHiddenUntilSubmit = a.metadata.hintHiddenUntilSubmit ?? true;
  const algorithmsHiddenUntilSubmit = a.metadata.algorithmsHiddenUntilSubmit ?? true;
  const canSeeHint = hasSubmitted || !hintHiddenUntilSubmit || showHintTemporarily;
  const canSeeAlgorithms = hasSubmitted || !algorithmsHiddenUntilSubmit || showAlgorithmsTemporarily;

  const included = cohort.includedSubmissions ?? [];
  const diffText = useMemo(
    () => pickPairwiseDiff(cohort.artifacts, pickA, pickB),
    [cohort.artifacts, pickA, pickB],
  );

  const canTryStartCohort =
    cohortLangOk &&
    duePassed &&
    cohortCountOk &&
    cohort.status !== "DONE" &&
    cohort.status !== "RUNNING";

  async function handleStartCohort() {
    setCohortErr(null);
    setCohortStarting(true);
    try {
      const next = await startCohortAnalysisAction(groupId, assignmentId);
      setCohort(next);
    } catch (e) {
      setCohortErr((e as Error).message);
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
                {canSeeAlgorithms
                  ? a.metadata.algorithms?.map((tag) => (
                      <Badge key={tag} tone="neutral" chipIndex={3}>
                        {tag}
                      </Badge>
                    ))
                  : null}
                {!canSeeAlgorithms && (a.metadata.algorithms?.length ?? 0) > 0 ? (
                  <button
                    type="button"
                    className={styles.revealBtn}
                    onClick={() => setShowAlgorithmsTemporarily(true)}
                  >
                    {t("assignment.detail.revealAlgorithms")}
                  </button>
                ) : null}
                {a.isLate ? <Badge tone="danger">{t("assignment.detail.lateBadge")}</Badge> : null}
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
                <Badge tone={mine ? "success" : "warning"}>
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
                {!canSeeHint ? (
                  <button type="button" className={styles.revealBtn} onClick={() => setShowHintTemporarily(true)}>
                    {t("assignment.detail.revealHint")}
                  </button>
                ) : null}
              </div>
              {canSeeHint ? (
                <p className={styles.descBody}>{a.hintPlain}</p>
              ) : (
                <p className={styles.lockedBody}>{t("assignment.detail.hintLocked")}</p>
              )}
            </section>
          ) : null}

          {cohortLangOk ? (
            <section className={styles.cohortCard} aria-labelledby="cohort-heading">
              <div className={styles.cohortHead}>
                <h2 id="cohort-heading" className={styles.cohortTitle}>
                  {t("assignment.detail.cohort.title")}
                </h2>
              </div>
              <p className={styles.cohortLead}>{t("assignment.detail.cohort.lead")}</p>
              {cohortLangOk && !duePassed ? (
                <p className={styles.cohortBlocked}>{t("assignment.detail.cohort.blockedDue")}</p>
              ) : null}
              {cohortLangOk && duePassed && !cohortCountOk ? (
                <p className={styles.cohortBlocked}>{t("assignment.detail.cohort.blockedCount")}</p>
              ) : null}
              {cohortErr !== null ? <p className={styles.cohortError}>{cohortErr}</p> : null}
              {(cohort.status === "NONE" || cohort.status === "FAILED") && canTryStartCohort ? (
                <button
                  type="button"
                  className={styles.cohortPrimaryBtn}
                  disabled={cohortStarting}
                  onClick={() => void handleStartCohort()}
                >
                  {cohortStarting ? t("assignment.detail.cohort.starting") : t("assignment.detail.cohort.start")}
                </button>
              ) : null}
              {cohort.status === "RUNNING" ? (
                <p className={styles.cohortStatus}>{t("assignment.detail.cohort.running")}</p>
              ) : null}
              {cohort.status === "FAILED" ? (
                <p className={styles.cohortStatus}>
                  {t("assignment.detail.cohort.failed")}
                  {cohort.failureReason ? ` — ${cohort.failureReason}` : ""}
                </p>
              ) : null}
              {cohort.status === "DONE" && cohort.reportMarkdown ? (
                <>
                  <h3 className={styles.cohortSubheading}>{t("assignment.detail.cohort.reportHeading")}</h3>
                  <div className={styles.cohortMd}>
                    <MarkdownPreview content={cohort.reportMarkdown} />
                  </div>
                  {typeof cohort.tokenUsed === "number" ? (
                    <p className={styles.cohortMuted}>
                      {t("assignment.detail.cohort.tokenUsed", { count: cohort.tokenUsed })}
                    </p>
                  ) : null}
                  {included.length >= 2 ? (
                    <>
                      <h3 className={styles.cohortSubheading}>{t("assignment.detail.cohort.diffHeading")}</h3>
                      <div className={styles.cohortDiffControls}>
                        <label className={styles.cohortSelectLabel}>
                          <span>{t("assignment.detail.cohort.pickA")}</span>
                          <select
                            className={styles.cohortSelect}
                            value={pickA}
                            onChange={(ev) => setPickA(ev.target.value)}
                          >
                            {included.map((row) => (
                              <option key={row.submissionId} value={row.submissionId}>
                                {t("assignment.detail.cohort.authorLabel", {
                                  nickname: row.authorNickname,
                                  version: row.versionNo,
                                })}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.cohortSelectLabel}>
                          <span>{t("assignment.detail.cohort.pickB")}</span>
                          <select
                            className={styles.cohortSelect}
                            value={pickB}
                            onChange={(ev) => setPickB(ev.target.value)}
                          >
                            {included.map((row) => (
                              <option key={`b-${row.submissionId}`} value={row.submissionId}>
                                {t("assignment.detail.cohort.authorLabel", {
                                  nickname: row.authorNickname,
                                  version: row.versionNo,
                                })}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <pre className={styles.cohortDiffPre}>{diffText.length > 0 ? diffText : "—"}</pre>
                    </>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside>
          <div className={styles.sideCard}>
            <div className={styles.sideHead}>
              <h2 className={styles.sideTitle}>{t("assignment.detail.sidebarTitle")}</h2>
              <span className={styles.sideCount}>{submissions.length}</span>
            </div>
            <div className={styles.sideNewWrap}>
              <Link href={`${submissionsBase}/new`} className={styles.sidePrimaryLink}>
                {t("submission.list.new")}
              </Link>
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
