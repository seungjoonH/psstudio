"use client";

// 과제 상세 화면을 2열 레이아웃과 그룹 제출 사이드바로 렌더링합니다.
import Link from "next/link";
import { useI18n } from "../../../../../src/i18n/I18nProvider";
import type { AssignmentDto } from "../../../../../src/assignments/server";
import type { SubmissionListItemDto } from "../../../../../src/submissions/server";
import { AppShell } from "../../../../../src/shell/AppShell";
import { Badge } from "../../../../../src/ui/Badge";
import { Icon } from "../../../../../src/ui/Icon";
import { GroupContextNav } from "../../GroupContextNav";
import styles from "./AssignmentDetailClient.module.css";

type Props = {
  groupId: string;
  assignmentId: string;
  assignment: AssignmentDto;
  canManage: boolean;
  meId: string;
  submissions: SubmissionListItemDto[];
  submissionSort: "createdAtAsc" | "createdAtDesc";
};

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
  assignmentId,
  assignment,
  canManage,
  meId,
  submissions,
  submissionSort,
}: Props) {
  const { t } = useI18n();
  const a = assignment;
  const due = new Date(a.dueAt);
  const assignmentBase = `/groups/${groupId}/assignments/${assignmentId}`;
  const submissionsBase = `${assignmentBase}/submissions`;
  const mine = submissions.find((s) => s.authorUserId === meId);
  const problemRef = formatProblemRef(a.problemUrl, a.platform);

  return (
    <AppShell
      title={a.title}
      subtitleKey="assignment.detail.subtitle"
      subtitleVars={{ platform: a.platform, date: due.toLocaleString() }}
      actions={
        canManage ? (
          <Link href={`${assignmentBase}/settings`} className={styles.secondaryLinkBtn}>
            {t("assignment.detail.settings")}
          </Link>
        ) : undefined
      }
    >
      <GroupContextNav groupId={groupId} />
      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <section className={styles.heroCard}>
            <div className={styles.heroTop}>
              <div className={styles.badgeRow}>
                <Badge tone="neutral">{a.platform}</Badge>
                {a.difficulty !== null ? <Badge tone="neutral">{a.difficulty}</Badge> : null}
                {a.metadata.algorithmTags?.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
                {a.isLate ? <Badge tone="danger">{t("assignment.detail.lateBadge")}</Badge> : null}
                <Badge tone={a.analysisStatus === "DONE" ? "success" : "warning"}>
                  {t("assignment.detail.analysisBadge", { status: a.analysisStatus })}
                </Badge>
              </div>
              <div className={styles.deadlineBlock}>
                <span className={styles.deadlineLabel}>{t("assignment.detail.deadlineLabel")}</span>
                <div className={`${styles.deadlineValue} ${a.isLate ? styles.deadlineLate : ""}`}>
                  {due.toLocaleString()}
                </div>
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

            <div className={styles.ctaRow}>
              <a
                href={a.problemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryLinkBtn}
              >
                <Icon name="externalLink" size={18} />
                {t("assignment.detail.openProblem")}
              </a>
              <Link href={`${submissionsBase}/new`} className={styles.secondaryLinkBtn}>
                {t("submission.list.new")}
              </Link>
            </div>
          </section>

          {a.descriptionPlain.length > 0 ? (
            <section className={styles.descCard}>
              <h2 className={styles.descHeading}>{t("assignment.detail.descriptionHeading")}</h2>
              <p className={styles.descBody}>{a.descriptionPlain}</p>
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
                          {s.authorProfileImageUrl.length > 0 ? (
                            <img
                              src={s.authorProfileImageUrl}
                              alt=""
                              width={28}
                              height={28}
                              className={styles.sideAvatar}
                            />
                          ) : null}
                          <span className={styles.sideName}>{s.authorNickname}</span>
                        </div>
                        <div className={styles.sideMetaBadges}>
                          <Badge tone="neutral">{s.language}</Badge>
                          {s.isLate ? <Badge tone="warning">{t("submission.list.late")}</Badge> : null}
                        </div>
                      </div>
                      <div className={styles.sideTitleLine}>{s.title}</div>
                      <div className={styles.sideTime}>{new Date(s.createdAt).toLocaleString()}</div>
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
