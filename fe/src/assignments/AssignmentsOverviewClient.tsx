"use client";
// 그룹 외부에서 과제 목록/캘린더를 통합 조회하는 뷰 컴포넌트입니다.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { AssignmentList, type AssignmentListItem } from "./AssignmentList";
import { formatAssignmentAlgorithmLabel } from "./algorithmLabels";
import { buildCls } from "../lib/buildCls";
import { formatCalendarWeekRangeLabel } from "../lib/formatCalendarWeekRangeLabel";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SegmentedControl } from "../ui/SegmentedControl";
import { EmptyState } from "../ui/states/EmptyState";
import styles from "./AssignmentsOverviewClient.module.css";

type SolvedFilter = "all" | "solved" | "unsolved";
type CalendarView = "week" | "month";

type OverviewItem = AssignmentListItem & {
  groupId: string;
};

type FilterState = {
  query: string;
  solvedFilter: SolvedFilter;
  selectedPlatforms: string[];
  selectedAlgorithms: string[];
  selectedGroupIds: string[];
};

type Props = {
  items: OverviewItem[];
  mode: "list" | "calendar";
};

type CalendarCell = {
  dateKey: string;
  dateIso: string;
  dayNumber: number;
  isOutsideMonth: boolean;
  isToday: boolean;
  assignments: OverviewItem[];
};

const getVisibleAlgorithms = (item: OverviewItem): string[] => {
  const hidden = item.algorithmsHiddenUntilSubmit ?? true;
  if (hidden && item.hasMySubmission !== true) return [];
  return (item.algorithms ?? []).filter((tag) => tag.length > 0);
};

const dayKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getStartOfWeek = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getMonthGridStart = (baseDate: Date): Date => {
  const first = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  return getStartOfWeek(first);
};

export function AssignmentsOverviewClient({ items, mode }: Props) {
  const { t, locale } = useI18n();
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const emptyFilter: FilterState = {
    query: "",
    solvedFilter: "all",
    selectedPlatforms: [],
    selectedAlgorithms: [],
    selectedGroupIds: [],
  };

  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [baseDate, setBaseDate] = useState<Date>(new Date());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(emptyFilter);
  const [draftFilter, setDraftFilter] = useState<FilterState>(emptyFilter);
  const [selectedDateCell, setSelectedDateCell] = useState<CalendarCell | null>(null);

  const platformOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.platform))).sort(),
    [items],
  );
  const algorithmOptions = useMemo(
    () =>
      Array.from(
        new Set(items.flatMap((item) => getVisibleAlgorithms(item))),
      ).sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const groupOptions = useMemo(
    () =>
      Array.from(new Map(items.map((item) => [item.groupId, { groupId: item.groupId, groupName: item.groupName ?? item.groupId }])).values()).sort((a, b) =>
        a.groupName.localeCompare(b.groupName),
      ),
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = appliedFilter.query.trim().toLowerCase();
    return items.filter((item) => {
      if (normalizedQuery.length > 0 && !item.title.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
      if (
        appliedFilter.selectedPlatforms.length > 0 &&
        !appliedFilter.selectedPlatforms.includes(item.platform)
      ) {
        return false;
      }
      if (
        appliedFilter.selectedAlgorithms.length > 0 &&
        !appliedFilter.selectedAlgorithms.every((algorithm) => getVisibleAlgorithms(item).includes(algorithm))
      ) {
        return false;
      }
      if (
        appliedFilter.selectedGroupIds.length > 0 &&
        !appliedFilter.selectedGroupIds.includes(item.groupId)
      ) {
        return false;
      }
      if (appliedFilter.solvedFilter === "solved" && item.hasMySubmission !== true) return false;
      if (appliedFilter.solvedFilter === "unsolved" && item.hasMySubmission === true) return false;
      return true;
    });
  }, [items, appliedFilter]);

  const activeFilterCount =
    (appliedFilter.query.trim().length > 0 ? 1 : 0) +
    (appliedFilter.solvedFilter !== "all" ? 1 : 0) +
    (appliedFilter.selectedPlatforms.length > 0 ? 1 : 0) +
    (appliedFilter.selectedAlgorithms.length > 0 ? 1 : 0) +
    (appliedFilter.selectedGroupIds.length > 0 ? 1 : 0);

  const groupedByDate = useMemo(() => {
    return filteredItems.reduce<Record<string, OverviewItem[]>>((acc, item) => {
      const key = dayKey(new Date(item.dueAt));
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const days = useMemo(() => {
    if (calendarView === "week") {
      const weekStart = getStartOfWeek(baseDate);
      return Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx));
    }
    const monthStart = getMonthGridStart(baseDate);
    return Array.from({ length: 42 }, (_, idx) => addDays(monthStart, idx));
  }, [calendarView, baseDate]);

  const calendarCells = useMemo<CalendarCell[]>(
    () =>
      days.map((day) => {
        const key = dayKey(day);
        return {
          dateKey: key,
          dateIso: day.toISOString(),
          dayNumber: day.getDate(),
          isOutsideMonth: calendarView === "month" && day.getMonth() !== baseDate.getMonth(),
          isToday: key === dayKey(new Date()),
          assignments: groupedByDate[key] ?? [],
        };
      }),
    [days, calendarView, baseDate, groupedByDate],
  );

  const periodLabel = useMemo(() => {
    if (calendarView === "week") {
      const weekStart = getStartOfWeek(baseDate);
      const weekEnd = addDays(weekStart, 6);
      return formatCalendarWeekRangeLabel(localeTag, weekStart, weekEnd);
    }
    return baseDate.toLocaleDateString(localeTag, { year: "numeric", month: "long" });
  }, [calendarView, baseDate, localeTag]);

  const openFilterModal = () => {
    setDraftFilter(appliedFilter);
    setIsFilterOpen(true);
  };

  const closeFilterModal = () => {
    setDraftFilter(appliedFilter);
    setIsFilterOpen(false);
  };

  const applyFilters = () => {
    setAppliedFilter(draftFilter);
    setIsFilterOpen(false);
  };

  const resetAppliedFilters = () => {
    setAppliedFilter(emptyFilter);
    setDraftFilter(emptyFilter);
  };

  const resetDraftFilters = () => setDraftFilter(emptyFilter);

  const movePeriod = (direction: "prev" | "next") => {
    const amount = direction === "prev" ? -1 : 1;
    if (calendarView === "week") {
      setBaseDate((prev) => addDays(prev, amount * 7));
      return;
    }
    setBaseDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
  };

  return (
    <div className={styles.root}>
      {mode === "list" ? (
        <div className={styles.topRow}>
          <Button
            variant="secondary"
            type="button"
            onClick={openFilterModal}
            leftIcon={<Icon name="filter" size={16} />}
          >
            {t("assignment.list.filter")}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
        </div>
      ) : null}

      <div className={styles.filterSummary}>
        <span className={styles.resultCount}>
          {t("assignment.list.resultCount", {
            shown: filteredItems.length,
            total: items.length,
          })}
        </span>
        {activeFilterCount > 0 ? (
          <button type="button" className={styles.resetButton} onClick={resetAppliedFilters}>
            {t("assignment.list.resetFilter")}
          </button>
        ) : null}
      </div>

      <div className={styles.activeChipRow}>
        {appliedFilter.selectedGroupIds.map((groupId) => {
          const option = groupOptions.find((item) => item.groupId === groupId);
          if (option === undefined) return null;
          return (
            <Chip
              key={groupId}
              className={styles.activeChip}
              onClick={() =>
                setAppliedFilter((prev) => ({
                  ...prev,
                  selectedGroupIds: prev.selectedGroupIds.filter((id) => id !== groupId),
                }))
              }
            >
              {option.groupName}
            </Chip>
          );
        })}
        {appliedFilter.selectedPlatforms.map((platform) => (
          <Chip
            key={platform}
            className={styles.activeChip}
            onClick={() =>
              setAppliedFilter((prev) => ({
                ...prev,
                selectedPlatforms: prev.selectedPlatforms.filter((item) => item !== platform),
              }))
            }
          >
            {platform}
          </Chip>
        ))}
        {appliedFilter.selectedAlgorithms.map((algorithm) => (
          <Chip
            key={algorithm}
            className={styles.activeChip}
            onClick={() =>
              setAppliedFilter((prev) => ({
                ...prev,
                selectedAlgorithms: prev.selectedAlgorithms.filter((item) => item !== algorithm),
              }))
            }
          >
            {formatAssignmentAlgorithmLabel(locale, algorithm)}
          </Chip>
        ))}
        {appliedFilter.solvedFilter !== "all" ? (
          <Chip
            className={styles.activeChip}
            onClick={() => setAppliedFilter((prev) => ({ ...prev, solvedFilter: "all" }))}
          >
            {appliedFilter.solvedFilter === "solved"
              ? t("assignment.list.solved")
              : t("assignment.list.unsolved")}
          </Chip>
        ) : null}
        {appliedFilter.query.trim().length > 0 ? (
          <Chip
            className={styles.activeChip}
            onClick={() => setAppliedFilter((prev) => ({ ...prev, query: "" }))}
          >
            {appliedFilter.query.trim()}
          </Chip>
        ) : null}
      </div>

      {mode === "list" ? (
        filteredItems.length === 0 ? (
          <EmptyState titleKey="assignments.emptyTitle" descriptionKey="assignment.list.emptyByFilterDesc" />
        ) : (
          <AssignmentList items={filteredItems} showGroupName />
        )
      ) : (
        <section className={styles.calendarCard}>
          <header className={styles.calendarHeader}>
            <div className={styles.headerActions}>
              <div className={styles.periodNav}>
                <button
                  type="button"
                  className={styles.iconNavBtn}
                  onClick={() => movePeriod("prev")}
                  aria-label={t("assignments.calendar.prevMonth")}
                >
                  <Icon name="chevronRight" size={16} className={styles.chevronLeft} />
                </button>
                <strong className={styles.periodLabel}>{periodLabel}</strong>
                <button
                  type="button"
                  className={styles.iconNavBtn}
                  onClick={() => movePeriod("next")}
                  aria-label={t("assignments.calendar.nextMonth")}
                >
                  <Icon name="chevronRight" size={16} />
                </button>
              </div>
              <div className={styles.rightActions}>
                <Button variant="secondary" type="button" className={styles.todayBtn} onClick={() => setBaseDate(new Date())}>
                  {t("assignments.calendar.today")}
                </Button>
                <div className={styles.viewSegmentWrap}>
                  <SegmentedControl
                    name="globalCalendarView"
                    defaultValue="month"
                    value={calendarView}
                    aria-label={t("assignments.calendar.viewAria")}
                    options={[
                      { value: "week", label: t("assignments.calendar.week") },
                      { value: "month", label: t("assignments.calendar.month") },
                    ]}
                    onValueChange={(value: string) => setCalendarView(value as CalendarView)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openFilterModal}
                  leftIcon={<Icon name="filter" size={16} />}
                >
                  {t("assignment.list.filter")}
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Button>
              </div>
            </div>
          </header>
          <div className={styles.weekHeader}>
            {[
              t("assignments.calendar.weekday.sun"),
              t("assignments.calendar.weekday.mon"),
              t("assignments.calendar.weekday.tue"),
              t("assignments.calendar.weekday.wed"),
              t("assignments.calendar.weekday.thu"),
              t("assignments.calendar.weekday.fri"),
              t("assignments.calendar.weekday.sat"),
            ].map((label) => (
              <span key={label} className={styles.weekLabel}>
                {label}
              </span>
            ))}
          </div>
          <div className={calendarView === "month" ? styles.monthGrid : styles.weekGrid}>
            {calendarCells.map((cell) => (
              <section
                key={cell.dateKey}
                className={buildCls(
                  styles.dayCell,
                  cell.isOutsideMonth && styles.dayCellMuted,
                  cell.isToday && styles.dayCellToday,
                )}
              >
                <button
                  type="button"
                  className={styles.dayCellHit}
                  onClick={() => setSelectedDateCell(cell)}
                >
                  <header className={styles.dayHead}>
                    <span className={buildCls(styles.dayNumber, cell.isOutsideMonth && styles.dayNumberMuted)}>
                      {cell.dayNumber}
                    </span>
                  </header>
                  <ul className={styles.assignmentList}>
                    {cell.assignments.map((assignment) => (
                      <li key={assignment.id} className={styles.assignmentRow}>
                        <span className={styles.assignmentPill}>{assignment.title}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              </section>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={isFilterOpen}
        title={t("assignment.list.filterTitle")}
        onClose={closeFilterModal}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={resetDraftFilters}>
              {t("assignment.list.resetFilter")}
            </Button>
            <Button variant="primary" type="button" onClick={applyFilters}>
              {t("assignment.list.applyFilter")}
            </Button>
          </>
        }
      >
        <div className={styles.filterForm}>
          <Input
            label={t("assignment.list.searchTitle")}
            value={draftFilter.query}
            onChange={(event) => setDraftFilter((prev) => ({ ...prev, query: event.target.value }))}
            placeholder={t("assignment.list.searchTitlePlaceholder")}
          />
          <div className={styles.filterSection}>
            <p className={styles.filterLabel}>{t("assignment.list.groupFilter")}</p>
            <div className={styles.chipRow}>
              {groupOptions.map((group) => (
                <Chip
                  key={group.groupId}
                  active={draftFilter.selectedGroupIds.includes(group.groupId)}
                  onClick={() =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      selectedGroupIds: prev.selectedGroupIds.includes(group.groupId)
                        ? prev.selectedGroupIds.filter((item) => item !== group.groupId)
                        : [...prev.selectedGroupIds, group.groupId],
                    }))
                  }
                >
                  {group.groupName}
                </Chip>
              ))}
            </div>
          </div>
          <div className={styles.filterSection}>
            <p className={styles.filterLabel}>{t("assignment.list.solvedFilter")}</p>
            <div className={styles.chipRow}>
              <Chip
                active={draftFilter.solvedFilter === "all"}
                onClick={() => setDraftFilter((prev) => ({ ...prev, solvedFilter: "all" }))}
              >
                {t("assignment.list.filterAll")}
              </Chip>
              <Chip
                active={draftFilter.solvedFilter === "solved"}
                onClick={() => setDraftFilter((prev) => ({ ...prev, solvedFilter: "solved" }))}
              >
                {t("assignment.list.solved")}
              </Chip>
              <Chip
                active={draftFilter.solvedFilter === "unsolved"}
                onClick={() => setDraftFilter((prev) => ({ ...prev, solvedFilter: "unsolved" }))}
              >
                {t("assignment.list.unsolved")}
              </Chip>
            </div>
          </div>
          <div className={styles.filterSection}>
            <p className={styles.filterLabel}>{t("assignment.list.platformFilter")}</p>
            <div className={styles.chipRow}>
              {platformOptions.map((platform) => (
                <Chip
                  key={platform}
                  active={draftFilter.selectedPlatforms.includes(platform)}
                  onClick={() =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      selectedPlatforms: prev.selectedPlatforms.includes(platform)
                        ? prev.selectedPlatforms.filter((item) => item !== platform)
                        : [...prev.selectedPlatforms, platform],
                    }))
                  }
                >
                  {platform}
                </Chip>
              ))}
            </div>
          </div>
          <div className={styles.filterSection}>
            <p className={styles.filterLabel}>{t("assignment.list.algorithmFilter")}</p>
            <div className={styles.chipRow}>
              {algorithmOptions.map((algorithm) => (
                <Chip
                  key={algorithm}
                  active={draftFilter.selectedAlgorithms.includes(algorithm)}
                  onClick={() =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      selectedAlgorithms: prev.selectedAlgorithms.includes(algorithm)
                        ? prev.selectedAlgorithms.filter((item) => item !== algorithm)
                        : [...prev.selectedAlgorithms, algorithm],
                    }))
                  }
                >
                  {formatAssignmentAlgorithmLabel(locale, algorithm)}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={selectedDateCell !== null}
        title={
          selectedDateCell === null
            ? ""
            : new Date(selectedDateCell.dateIso).toLocaleDateString(localeTag, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
        }
        onClose={() => setSelectedDateCell(null)}
      >
        {selectedDateCell !== null && selectedDateCell.assignments.length === 0 ? (
          <p className={styles.modalEmpty}>{t("groupCalendar.modalEmpty")}</p>
        ) : null}
        {selectedDateCell !== null && selectedDateCell.assignments.length > 0 ? (
          <ul className={styles.modalAssignmentList}>
            {selectedDateCell.assignments.map((assignment) => (
              <li key={assignment.id} className={styles.modalAssignmentRow}>
                <Link
                  href={assignment.href}
                  className={styles.modalAssignmentLink}
                  onClick={() => setSelectedDateCell(null)}
                >
                  <span className={styles.modalAssignmentTitle}>{assignment.title}</span>
                  <span className={styles.modalAssignmentMeta}>{assignment.groupName}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    </div>
  );
}
