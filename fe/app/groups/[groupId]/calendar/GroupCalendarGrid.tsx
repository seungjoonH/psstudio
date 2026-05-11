"use client";

// 그룹 캘린더 날짜 셀·모바일 점 표시·일별 과제 모달을 담당합니다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import { InlineAddButton } from "../../../../src/ui/InlineAddButton";
import { Modal } from "../../../../src/ui/Modal";
import styles from "./page.module.css";

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

export function GroupCalendarGrid({ groupId, canCreate, cells, gridClassName }: Props) {
  const { t, locale } = useI18n();
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarGridCell | null>(null);

  const closeModal = useCallback(() => setSelected(null), []);

  const modalTitle = useMemo(() => {
    if (selected === null) return "";
    return new Date(selected.dateIso).toLocaleDateString(localeTag, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [localeTag, selected]);

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
                {cell.assignments.map((assignment) => (
                  <li key={assignment.id} className={styles.assignmentRow}>
                    <span className={styles.assignmentPill}>
                      <span className={styles.assignmentTitle}>{assignment.title}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {cell.assignments.length > 0 ? (
                <div className={styles.dotRow} aria-hidden>
                  {cell.assignments.map((assignment) => (
                    <span key={assignment.id} className={styles.assignmentDot} />
                  ))}
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
            {selected.assignments.map((assignment) => (
              <li key={assignment.id} className={styles.modalAssignmentRow}>
                <Link
                  href={`/groups/${groupId}/assignments/${assignment.id}`}
                  className={styles.modalAssignmentLink}
                  onClick={() => closeModal()}
                >
                  <span className={styles.modalAssignmentTitle}>{assignment.title}</span>
                  <span className={styles.modalAssignmentDue}>
                    {t("groupCalendar.modalDueLabel")}{" "}
                    {new Date(assignment.dueAt).toLocaleString(localeTag)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    </>
  );
}
