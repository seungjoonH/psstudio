// 캘린더 헤더 필터와 그리드 필터링 상태를 관리하는 클라이언트 컴포넌트입니다.
"use client";

import { useMemo, useState } from "react";
import type { GroupMember } from "../../../../src/groups/server";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import { formatProblemPlatformLabel } from "../../../../src/assignments/algorithmLabels";
import { Button } from "../../../../src/ui/Button";
import { Chip } from "../../../../src/ui/Chip";
import { Input } from "../../../../src/ui/Input";
import { Modal } from "../../../../src/ui/Modal";
import { CalendarHeaderControls } from "./CalendarHeaderControls";
import type { CalendarGridCell } from "./GroupCalendarGrid";
import { formatCalendarWeekRangeLabel } from "../../../../src/lib/formatCalendarWeekRangeLabel";
import { GroupCalendarGrid } from "./GroupCalendarGrid";
import styles from "./page.module.css";

type SolvedFilter = "all" | "solved" | "unsolved";
type FilterState = {
  query: string;
  solvedFilter: SolvedFilter;
  selectedPlatforms: string[];
  selectedAlgorithms: string[];
  selectedAssigneeIds: string[];
};

type Props = {
  groupId: string;
  view: "week" | "month";
  baseDateIso: string;
  prevDateIso: string;
  nextDateIso: string;
  canCreate: boolean;
  members: GroupMember[];
  cells: CalendarGridCell[];
  gridClassName: string;
};

export function GroupCalendarClient({
  groupId,
  view,
  baseDateIso,
  prevDateIso,
  nextDateIso,
  canCreate,
  members,
  cells,
  gridClassName,
}: Props) {
  const { t, locale } = useI18n();
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";
  const baseDate = new Date(baseDateIso);
  const periodLabel = useMemo(() => {
    if (view === "week") {
      const weekStart = new Date(baseDate);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return formatCalendarWeekRangeLabel(localeTag, weekStart, weekEnd);
    }
    return baseDate.toLocaleDateString(localeTag, { year: "numeric", month: "long" });
  }, [baseDate, localeTag, view]);
  const emptyFilter: FilterState = {
    query: "",
    solvedFilter: "all",
    selectedPlatforms: [],
    selectedAlgorithms: [],
    selectedAssigneeIds: [],
  };
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(emptyFilter);
  const [draftFilter, setDraftFilter] = useState<FilterState>(emptyFilter);

  const flatAssignments = useMemo(() => cells.flatMap((cell) => cell.assignments), [cells]);
  const platformOptions = useMemo(
    () => Array.from(new Set(flatAssignments.map((item) => item.platform))).sort(),
    [flatAssignments],
  );
  const algorithmOptions = useMemo(
    () =>
      Array.from(
        new Set(flatAssignments.flatMap((item) => item.algorithms).filter((tag) => tag.length > 0)),
      ).sort((a, b) => a.localeCompare(b)),
    [flatAssignments],
  );
  const assigneeOptions = useMemo(
    () =>
      members
        .map((member) => ({ userId: member.userId, nickname: member.nickname }))
        .sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [members],
  );

  const filteredCells = useMemo(() => {
    const normalizedQuery = appliedFilter.query.trim().toLowerCase();
    return cells.map((cell) => ({
      ...cell,
      assignments: cell.assignments.filter((assignment) => {
        if (normalizedQuery.length > 0 && !assignment.title.toLowerCase().includes(normalizedQuery)) {
          return false;
        }
        if (
          appliedFilter.selectedPlatforms.length > 0 &&
          !appliedFilter.selectedPlatforms.includes(assignment.platform)
        ) {
          return false;
        }
        if (
          appliedFilter.selectedAlgorithms.length > 0 &&
          !appliedFilter.selectedAlgorithms.every((algorithm) => assignment.algorithms.includes(algorithm))
        ) {
          return false;
        }
        if (
          appliedFilter.selectedAssigneeIds.length > 0 &&
          !appliedFilter.selectedAssigneeIds.some((id) => assignment.assigneeUserIds.includes(id))
        ) {
          return false;
        }
        const isSolved = assignment.hasMySubmission;
        if (appliedFilter.solvedFilter === "solved" && !isSolved) return false;
        if (appliedFilter.solvedFilter === "unsolved" && isSolved) return false;
        return true;
      }),
    }));
  }, [cells, appliedFilter]);

  const activeFilterCount =
    (appliedFilter.query.trim().length > 0 ? 1 : 0) +
    (appliedFilter.solvedFilter !== "all" ? 1 : 0) +
    (appliedFilter.selectedPlatforms.length > 0 ? 1 : 0) +
    (appliedFilter.selectedAlgorithms.length > 0 ? 1 : 0) +
    (appliedFilter.selectedAssigneeIds.length > 0 ? 1 : 0);

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

  const resetDraftFilters = () => {
    setDraftFilter(emptyFilter);
  };

  return (
    <>
      <header className={styles.calendarHeader}>
        <CalendarHeaderControls
          groupId={groupId}
          view={view}
          baseDateIso={baseDateIso}
          prevDateIso={prevDateIso}
          nextDateIso={nextDateIso}
          periodLabel={periodLabel}
          canCreate={canCreate}
          activeFilterCount={activeFilterCount}
          onOpenFilter={openFilterModal}
        />
      </header>

      <div className={styles.activeChipRow}>
        {appliedFilter.selectedAssigneeIds.map((id) => {
          const member = assigneeOptions.find((option) => option.userId === id);
          if (member === undefined) return null;
          return (
            <Chip
              key={id}
              className={styles.activeChip}
              onClick={() =>
                setAppliedFilter((prev) => ({
                  ...prev,
                  selectedAssigneeIds: prev.selectedAssigneeIds.filter((item) => item !== id),
                }))
              }
            >
              {member.nickname}
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
            {formatProblemPlatformLabel(locale, platform)}
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
            {algorithm}
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

      <div className={styles.weekHeader}>
        {[
          t("groupCalendar.weekday.sun"),
          t("groupCalendar.weekday.mon"),
          t("groupCalendar.weekday.tue"),
          t("groupCalendar.weekday.wed"),
          t("groupCalendar.weekday.thu"),
          t("groupCalendar.weekday.fri"),
          t("groupCalendar.weekday.sat"),
        ].map((label) => (
          <span key={label} className={styles.weekLabel}>
            {label}
          </span>
        ))}
      </div>

      <GroupCalendarGrid
        groupId={groupId}
        canCreate={canCreate}
        cells={filteredCells}
        gridClassName={gridClassName}
      />

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
            <p className={styles.filterLabel}>{t("assignment.list.assignee")}</p>
            <div className={styles.chipRow}>
              {assigneeOptions.map((member) => (
                <Chip
                  key={member.userId}
                  active={draftFilter.selectedAssigneeIds.includes(member.userId)}
                  onClick={() =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      selectedAssigneeIds: prev.selectedAssigneeIds.includes(member.userId)
                        ? prev.selectedAssigneeIds.filter((item) => item !== member.userId)
                        : [...prev.selectedAssigneeIds, member.userId],
                    }))
                  }
                >
                  {member.nickname}
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
                  {formatProblemPlatformLabel(locale, platform)}
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
                  {algorithm}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
