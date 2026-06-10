"use client";

// 그룹 캘린더 날짜 셀·모바일 점 표시·일별 과제 모달을 담당합니다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  formatAssignmentAlgorithmLabel,
  formatProblemPlatformLabel,
} from "../../../../src/assignments/algorithmLabels";
import { formatKstDateTime, formatKstDateWithWeekday } from "../../../../src/i18n/formatDateTime";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import { dueBadgeTone } from "../../../../src/lib/dueBadgeTone";
import { Badge } from "../../../../src/ui/Badge";
import { DifficultyBadge } from "../../../../src/ui/DifficultyBadge";
import { InlineAddButton } from "../../../../src/ui/InlineAddButton";
import { Modal } from "../../../../src/ui/Modal";
import { UserAvatar } from "../../../../src/ui/UserAvatar";
import styles from "./page.module.css";

type CalendarGridAssignee = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
};

export type CalendarGridAssignment = {
  id: string;
  title: string;
  dueAt: string;
  platform: string;
  difficulty: string | null;
  analysisStatus: string;
  algorithms: string[];
  submitterIds: string[];
  hasMySubmission: boolean;
  hasLateSubmission: boolean;
  assigneeUserIds: string[];
  assignees: CalendarGridAssignee[];
  createdByUser: CalendarGridAssignee;
  solvedAssignees: CalendarGridAssignee[];
  unsolvedAssignees: CalendarGridAssignee[];
  isAssignedToMe: boolean;
};

export type CalendarGridCell = {
  dateKey: string;
  dateIso: string;
  dueDateForNew: string;
  dayNumber: number;
  isOutsideMonth: boolean;
  isToday: boolean;
  assignments: CalendarGridAssignment[];
};

type Props = {
  groupId: string;
  canCreate: boolean;
  cells: CalendarGridCell[];
  gridClassName: string;
};

function getAssignmentTone(
  assignment: CalendarGridAssignment,
): "solved" | "late" | "unsolved" | "overdue" {
  const isPastDue = new Date(assignment.dueAt).getTime() < Date.now();
  const isSolved =
    assignment.assignees.length > 0
      ? assignment.unsolvedAssignees.length === 0
      : assignment.submitterIds.length > 0;

  if (!isSolved) return isPastDue ? "overdue" : "unsolved";
  return assignment.hasLateSubmission ? "late" : "solved";
}

function getSubmissionProgressPercent(submittedCount: number, assigneeCount: number): number {
  if (assigneeCount <= 0) return 0;
  return Math.min(100, Math.round((submittedCount / assigneeCount) * 100));
}

export function GroupCalendarGrid({ groupId, canCreate, cells, gridClassName }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarGridCell | null>(null);

  const closeModal = useCallback(() => setSelected(null), []);

  const modalTitle = useMemo(() => {
    if (selected === null) return "";
    return formatKstDateWithWeekday(selected.dateIso, locale);
  }, [locale, selected]);

  return (
    <>
      <div className={gridClassName}>
        {cells.map((cell) => {
        const assignmentLabel =
          cell.assignments.length === 0
            ? t("groupCalendar.cellAriaNoAssignments", { day: cell.dayNumber })
            : t("groupCalendar.cellAriaWithAssignments", {
                day: cell.dayNumber,
                count: cell.assignments.length,
              });

        return (
          <section
            key={cell.dateKey}
            className={`${styles.dayCell} ${cell.isToday ? styles.dayCellToday : ""} ${cell.isOutsideMonth ? styles.dayCellMuted : ""}`.trim()}
          >
            <div
              className={styles.dayCellHit}
              role="button"
              tabIndex={0}
              aria-label={assignmentLabel}
              onClick={() => setSelected(cell)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(cell);
                }
              }}
            >
              <header className={styles.dayHead}>
                {canCreate ? (
                  <InlineAddButton
                    className={styles.quickAdd}
                    aria-label={t("groupCalendar.quickAddAria")}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/groups/${groupId}/assignments/new?dueDate=${cell.dueDateForNew}`);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                ) : null}
                <span
                  className={`${styles.dayNumber} ${cell.isOutsideMonth ? styles.dayNumberMuted : ""}`.trim()}
                >
                  {cell.dayNumber}
                </span>
              </header>

              <ul className={styles.assignmentList}>
                {cell.assignments.map((assignment) => {
                  const tone = getAssignmentTone(assignment);
                  return (
                    <li
                      key={assignment.id}
                      className={[
                        styles.assignmentRow,
                        tone === "solved"
                          ? styles.assignmentRowSolved
                          : tone === "late"
                            ? styles.assignmentRowLate
                            : tone === "overdue"
                              ? styles.assignmentRowOverdue
                              : styles.assignmentRowUnsolved,
                      ].join(" ")}
                    >
                      <span className={styles.assignmentPill}>
                        <span className={styles.assignmentTitle}>{assignment.title}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {cell.assignments.length > 0 ? (
                <div className={styles.dotRow} aria-hidden>
                  {cell.assignments.map((assignment) => {
                    const tone = getAssignmentTone(assignment);
                    return (
                      <span
                        key={assignment.id}
                        className={[
                          styles.assignmentDot,
                          tone === "solved"
                            ? styles.assignmentDotSolved
                            : tone === "late"
                              ? styles.assignmentDotLate
                              : tone === "overdue"
                                ? styles.assignmentDotOverdue
                                : styles.assignmentDotUnsolved,
                        ].join(" ")}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
      </div>

      <Modal open={selected !== null} title={modalTitle} onClose={closeModal}>
        {selected !== null && selected.assignments.length === 0 ? (
          <p className={styles.modalEmpty}>{t("groupCalendar.modalEmpty")}</p>
        ) : null}
        {selected !== null && selected.assignments.length > 0 ? (
          <ul className={styles.modalAssignmentList}>
            {selected.assignments.map((assignment) => {
              const platformLabel = formatProblemPlatformLabel(locale, assignment.platform);
              const tone = getAssignmentTone(assignment);
              const submittedCount = assignment.submitterIds.length;
              const assigneeCount = assignment.assigneeUserIds.length;
              const progressPercent = getSubmissionProgressPercent(submittedCount, assigneeCount);
              const due = new Date(assignment.dueAt);
              const daysLeft = Math.max(0, Math.ceil((due.getTime() - Date.now()) / (24 * 3600 * 1000)));
              const isLate = due.getTime() < Date.now();
              const dueLabel = isLate ? t("assignment.list.late") : `D-${daysLeft}`;
              return (
                <li key={assignment.id} className={styles.modalAssignmentRow}>
                  <Link
                    href={`/groups/${groupId}/assignments/${assignment.id}`}
                    className={[
                      styles.modalAssignmentLink,
                      tone === "solved"
                        ? styles.modalAssignmentLinkSolved
                        : tone === "late"
                          ? styles.modalAssignmentLinkLate
                          : tone === "overdue"
                            ? styles.modalAssignmentLinkOverdue
                            : styles.modalAssignmentLinkUnsolved,
                    ].join(" ")}
                    onClick={() => closeModal()}
                  >
                    <div className={styles.modalHeadRow}>
                      <div className={styles.modalHeadLeft}>
                        <span className={styles.modalAssignmentTitle} title={assignment.title}>
                          {assignment.title}
                        </span>
                        <div className={styles.modalChipRow}>
                          <Badge tone="neutral">{platformLabel}</Badge>
                          <DifficultyBadge platform={assignment.platform} difficulty={assignment.difficulty} />
                          <span
                            className={styles.modalCreator}
                            title={`${t("assignment.list.creator")}: ${assignment.createdByUser.nickname}`}
                          >
                            <UserAvatar
                              nickname={assignment.createdByUser.nickname}
                              imageUrl={assignment.createdByUser.profileImageUrl}
                              size={18}
                            />
                            <span className={styles.modalCreatorName}>{assignment.createdByUser.nickname}</span>
                          </span>
                        </div>
                      </div>
                      <div className={styles.modalDueGroup}>
                        <div className={styles.modalDueBadges}>
                          {assignment.isAssignedToMe ? (
                            <span className={styles.modalMyBadge}>{t("assignment.list.assignedToMe")}</span>
                          ) : null}
                          {assignment.isAssignedToMe ? (
                            <Badge tone={assignment.hasMySubmission ? "success" : "danger"}>
                              {assignment.hasMySubmission
                                ? t("assignment.list.solved")
                                : t("assignment.list.unsolved")}
                            </Badge>
                          ) : null}
                          <Badge tone={dueBadgeTone(isLate, daysLeft)}>{dueLabel}</Badge>
                        </div>
                        <span className={styles.modalDueAt}>
                          {t("groupCalendar.modalDueLabel")} {formatKstDateTime(assignment.dueAt, locale)}
                        </span>
                      </div>
                    </div>
                    {assignment.algorithms.length > 0 || assigneeCount > 0 || submittedCount > 0 ? (
                      <div className={styles.modalMetaRow}>
                        <div className={styles.modalAlgoGroup}>
                          {assignment.algorithms.map((tag) => (
                            <Badge key={tag} tone="neutral">
                              {formatAssignmentAlgorithmLabel(locale, tag)}
                            </Badge>
                          ))}
                        </div>
                        <div className={styles.modalProgressBlock}>
                          <span className={styles.modalProgressLabel}>
                            {assigneeCount > 0
                              ? t("assignment.list.submissionProgress", {
                                  submitted: submittedCount,
                                  total: assigneeCount,
                                })
                              : t("assignment.list.submissionProgressNoTarget", {
                                  submitted: submittedCount,
                                })}
                          </span>
                          {assigneeCount > 0 ? (
                            <div className={styles.modalProgressTrack} aria-hidden>
                              <div
                                className={styles.modalProgressFill}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {assignment.isAssignedToMe ? (
                      <div className={styles.modalAssigneeGroups}>
                        {assignment.solvedAssignees.length > 0 ? (
                          <div
                            className={[styles.modalAssigneeGroup, styles.modalAssigneeGroupSolved].join(" ")}
                          >
                            <span className={styles.modalAssigneeLabel}>{t("groupCalendar.modalSolvedAssignees")}</span>
                            <div className={styles.modalAvatarRow}>
                              {assignment.solvedAssignees.map((assignee) => (
                                <UserAvatar
                                  key={`${assignment.id}-solved-${assignee.userId}`}
                                  nickname={assignee.nickname}
                                  imageUrl={assignee.profileImageUrl}
                                  size={26}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {assignment.unsolvedAssignees.length > 0 ? (
                          <div
                            className={[styles.modalAssigneeGroup, styles.modalAssigneeGroupUnsolved].join(" ")}
                          >
                            <span className={styles.modalAssigneeLabel}>{t("groupCalendar.modalUnsolvedAssignees")}</span>
                            <div className={styles.modalAvatarRow}>
                              {assignment.unsolvedAssignees.map((assignee) => (
                                <UserAvatar
                                  key={`${assignment.id}-unsolved-${assignee.userId}`}
                                  nickname={assignee.nickname}
                                  imageUrl={assignee.profileImageUrl}
                                  size={26}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Modal>
    </>
  );
}
