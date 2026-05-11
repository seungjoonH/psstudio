"use client";

// 그룹 내 과제 목록을 i18n 적용해 렌더링하는 클라이언트 컴포넌트입니다.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import type { AssignmentDto } from "../../../../src/assignments/server";
import type { GroupMember } from "../../../../src/groups/server";
import { AssignmentList } from "../../../../src/assignments/AssignmentList";
import { AppShell } from "../../../../src/shell/AppShell";
import { Button } from "../../../../src/ui/Button";
import { Icon } from "../../../../src/ui/Icon";
import { Chip } from "../../../../src/ui/Chip";
import { Input } from "../../../../src/ui/Input";
import { Modal } from "../../../../src/ui/Modal";
import { EmptyState } from "../../../../src/ui/states/EmptyState";
import { GroupSubnavCluster } from "../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../GroupRouteBreadcrumbs";
import styles from "./page.module.css";

type AssignmentWithSubmitters = AssignmentDto & { submitterIds: string[] };

type SolvedFilter = "all" | "solved" | "unsolved";
type FilterState = {
  query: string;
  solvedFilter: SolvedFilter;
  selectedPlatforms: string[];
  selectedAlgorithms: string[];
  selectedSubmitterIds: string[];
};

type Props = {
  groupId: string;
  groupName: string;
  items: AssignmentWithSubmitters[];
  members: GroupMember[];
  canCreate: boolean;
};

const getVisibleAlgorithms = (item: AssignmentWithSubmitters): string[] => {
  const hidden = item.metadata.algorithmsHiddenUntilSubmit ?? true;
  if (hidden && item.hasMySubmission !== true) return [];
  return (item.metadata.algorithms ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
};

export function AssignmentsListClient({ groupId, groupName, items, members, canCreate }: Props) {
  const { t } = useI18n();
  const emptyFilter: FilterState = {
    query: "",
    solvedFilter: "all",
    selectedPlatforms: [],
    selectedAlgorithms: [],
    selectedSubmitterIds: [],
  };
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(emptyFilter);
  const [draftFilter, setDraftFilter] = useState<FilterState>(emptyFilter);

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
  const submitterOptions = useMemo(
    () =>
      members
        .map((member) => ({ userId: member.userId, nickname: member.nickname }))
        .sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [members],
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
      if (appliedFilter.selectedAlgorithms.length > 0) {
        const assignmentAlgorithms = getVisibleAlgorithms(item);
        if (
          !appliedFilter.selectedAlgorithms.every((algorithm) =>
            assignmentAlgorithms.includes(algorithm),
          )
        ) {
          return false;
        }
      }
      if (
        appliedFilter.selectedSubmitterIds.length > 0 &&
        !appliedFilter.selectedSubmitterIds.some((id) => item.submitterIds.includes(id))
      ) {
        return false;
      }

      const isSolved =
        appliedFilter.selectedSubmitterIds.length > 0
          ? appliedFilter.selectedSubmitterIds.some((id) => item.submitterIds.includes(id))
          : item.hasMySubmission === true;
      if (appliedFilter.solvedFilter === "solved" && !isSolved) return false;
      if (appliedFilter.solvedFilter === "unsolved" && isSolved) return false;
      return true;
    });
  }, [items, appliedFilter]);

  const activeFilterCount =
    (appliedFilter.query.trim().length > 0 ? 1 : 0) +
    (appliedFilter.solvedFilter !== "all" ? 1 : 0) +
    (appliedFilter.selectedPlatforms.length > 0 ? 1 : 0) +
    (appliedFilter.selectedAlgorithms.length > 0 ? 1 : 0) +
    (appliedFilter.selectedSubmitterIds.length > 0 ? 1 : 0);

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

  const resetDraftFilters = () => {
    setDraftFilter(emptyFilter);
  };

  return (
    <AppShell titleKey="assignment.list.title" titleVars={{ name: groupName }} subtitleKey="assignment.list.subtitle">
      <div className={styles.root}>
        <GroupSubnavCluster groupId={groupId}>
          <GroupRouteBreadcrumbs groupId={groupId} />
        </GroupSubnavCluster>
        <div className={styles.actionsRow}>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              type="button"
              onClick={openFilterModal}
              leftIcon={<Icon name="filter" size={16} />}
            >
              {t("assignment.list.filter")}
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
            {canCreate ? (
              <Link href={`/groups/${groupId}/assignments/new`}>
                <Button variant="primary" type="button">
                  {t("assignment.list.create")}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
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
          {appliedFilter.selectedSubmitterIds.map((id) => {
            const member = submitterOptions.find((option) => option.userId === id);
            if (member === undefined) return null;
            return (
              <Chip
                key={id}
                className={styles.activeChip}
                onClick={() =>
                  setAppliedFilter((prev) => ({
                    ...prev,
                    selectedSubmitterIds: prev.selectedSubmitterIds.filter((item) => item !== id),
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
        {filteredItems.length === 0 ? (
          <EmptyState
            titleKey="assignment.list.emptyTitle"
            descriptionKey="assignment.list.emptyByFilterDesc"
          />
        ) : (
          <AssignmentList
            showGroupName={false}
            items={filteredItems.map((a) => ({
              id: a.id,
              href: `/groups/${groupId}/assignments/${a.id}`,
              title: a.title,
              dueAt: a.dueAt,
              isLate: a.isLate,
              hasMySubmission: a.hasMySubmission,
              platform: a.platform,
              difficulty: a.difficulty,
              algorithms: getVisibleAlgorithms(a),
              algorithmsHiddenUntilSubmit: a.metadata.algorithmsHiddenUntilSubmit ?? true,
              analysisStatus: a.analysisStatus,
            }))}
          />
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
              onChange={(event) =>
                setDraftFilter((prev) => ({ ...prev, query: event.target.value }))
              }
              placeholder={t("assignment.list.searchTitlePlaceholder")}
            />
            <div className={styles.filterSection}>
              <p className={styles.filterLabel}>{t("assignment.list.submitter")}</p>
              <div className={styles.chipRow}>
                {submitterOptions.map((member) => (
                  <Chip
                    key={member.userId}
                    active={draftFilter.selectedSubmitterIds.includes(member.userId)}
                    onClick={() =>
                      setDraftFilter((prev) => ({
                        ...prev,
                        selectedSubmitterIds: prev.selectedSubmitterIds.includes(member.userId)
                          ? prev.selectedSubmitterIds.filter((item) => item !== member.userId)
                          : [...prev.selectedSubmitterIds, member.userId],
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
                  onClick={() =>
                    setDraftFilter((prev) => ({ ...prev, solvedFilter: "solved" }))
                  }
                >
                  {t("assignment.list.solved")}
                </Chip>
                <Chip
                  active={draftFilter.solvedFilter === "unsolved"}
                  onClick={() =>
                    setDraftFilter((prev) => ({ ...prev, solvedFilter: "unsolved" }))
                  }
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
                    {algorithm}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
