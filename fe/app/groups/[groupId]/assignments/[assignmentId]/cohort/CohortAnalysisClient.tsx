// 집단 코드 비교 전용 페이지의 클라이언트 상태·폴링·본문 렌더링을 담당합니다.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CohortAnalysisDto, CohortSubmissionArtifact } from "../../../../../../src/assignments/server";
import { useI18n } from "../../../../../../src/i18n/I18nProvider";
import { CohortCodeColumns } from "../../../../../../src/ui/cohort/CohortCodeColumns";
import { CohortReportBody } from "../../../../../../src/ui/cohort/CohortReportBody";
import { getCohortAnalysisStateAction, startCohortAnalysisAction } from "../../actions";
import styles from "./CohortAnalysisClient.module.css";

function cohortSubmissions(a: unknown): CohortSubmissionArtifact[] | null {
  if (typeof a !== "object" || a === null) return null;
  const subs = (a as { submissions?: unknown }).submissions;
  if (!Array.isArray(subs) || subs.length === 0) return null;
  return subs as CohortSubmissionArtifact[];
}

type Props = {
  groupId: string;
  assignmentId: string;
  assignmentTitle: string;
  cohortInitial: CohortAnalysisDto;
  canStartCohort: boolean;
};

export function CohortAnalysisClient({
  groupId,
  assignmentId,
  assignmentTitle,
  cohortInitial,
  canStartCohort,
}: Props) {
  const { t } = useI18n();
  const [cohort, setCohort] = useState<CohortAnalysisDto>(cohortInitial);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const assignmentHref = `/groups/${groupId}/assignments/${assignmentId}`;

  useEffect(() => {
    if (cohort.status !== "RUNNING") return;
    const id = window.setInterval(() => {
      void getCohortAnalysisStateAction(assignmentId)
        .then(setCohort)
        .catch(() => {
          /* ignore */
        });
    }, 3000);
    return () => window.clearInterval(id);
  }, [cohort.status, assignmentId]);

  async function handleStart() {
    setErr(null);
    setStarting(true);
    try {
      const next = await startCohortAnalysisAction(groupId, assignmentId);
      setCohort(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const included = cohort.includedSubmissions ?? [];
  const titlesMap = new Map(included.map((r) => [r.submissionId, { title: r.title, versionNo: r.versionNo }]));
  const submissions = cohortSubmissions(cohort.artifacts);

  return (
    <div className={styles.root}>
      <div className={styles.headRow}>
        <Link href={assignmentHref} className={styles.back}>
          ← {t("assignment.cohortPage.back")}
        </Link>
      </div>
      <h1 className={styles.title}>{t("assignment.cohortPage.heading")}</h1>
      <p className={styles.sub}>{assignmentTitle}</p>

      {err !== null ? <p className={styles.error}>{err}</p> : null}

      {cohort.status === "NONE" && canStartCohort ? (
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primary}
            disabled={starting}
            onClick={() => void handleStart()}
          >
            {t("assignment.detail.cohort.start")}
          </button>
          {starting ? <span className={styles.spinner} aria-hidden /> : null}
        </div>
      ) : null}

      {cohort.status === "NONE" && !canStartCohort ? (
        <p className={styles.muted}>{t("assignment.cohortPage.cannotStartHere")}</p>
      ) : null}

      {cohort.status === "RUNNING" ? (
        <div className={styles.actionRow}>
          <button type="button" className={styles.primary} disabled aria-busy>
            {t("assignment.detail.cohort.start")}
          </button>
          <span className={styles.spinner} aria-hidden />
          <span className={styles.srOnly}>{t("assignment.detail.cohort.running")}</span>
        </div>
      ) : null}

      {cohort.status === "FAILED" ? (
        <p className={styles.error}>
          {t("assignment.detail.cohort.failed")}
          {cohort.failureReason ? ` — ${cohort.failureReason}` : ""}
        </p>
      ) : null}

      {cohort.status === "DONE" && cohort.reportMarkdown !== null && cohort.reportMarkdown !== undefined ? (
        <>
          <section className={styles.section} aria-labelledby="cohort-report">
            <h2 id="cohort-report" className={styles.sectionTitle}>
              {t("assignment.detail.cohort.reportHeading")}
            </h2>
            {included.length > 0 ? (
              <CohortReportBody
                reportMarkdown={cohort.reportMarkdown}
                groupId={groupId}
                assignmentId={assignmentId}
                included={included}
              />
            ) : null}
          </section>

          {typeof cohort.tokenUsed === "number" ? (
            <p className={styles.token}>{t("assignment.detail.cohort.tokenUsed", { count: cohort.tokenUsed })}</p>
          ) : null}

          {submissions !== null && submissions.length > 0 ? (
            <section className={styles.section} aria-labelledby="cohort-code">
              <h2 id="cohort-code" className={styles.sectionTitle}>
                {t("assignment.cohortPage.codeHeading")}
              </h2>
              <CohortCodeColumns submissions={submissions} titlesBySubmissionId={titlesMap} />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
