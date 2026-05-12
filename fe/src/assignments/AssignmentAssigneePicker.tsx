"use client";
// 과제 대상자 선택 UI를 렌더링하는 공용 컴포넌트입니다.

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { Chip } from "../ui/Chip";
import { UserAvatar } from "../ui/UserAvatar";
import styles from "./AssignmentAssigneePicker.module.css";

export type AssignmentAssigneeMember = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
};

type Props = {
  members: AssignmentAssigneeMember[];
  meUserId: string;
  initialSelectedUserIds?: string[];
  inputName?: string;
  onSelectionChange?: (userIds: string[]) => void;
};

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function isAssigneeSelectionValid(
  myRole: "OWNER" | "MANAGER",
  meUserId: string,
  selectedUserIds: string[],
): boolean {
  if (selectedUserIds.length === 0) return false;
  if (myRole === "MANAGER" && !selectedUserIds.includes(meUserId)) return false;
  return true;
}

export function AssignmentAssigneePicker({
  members,
  meUserId,
  initialSelectedUserIds,
  inputName = "assigneeUserIds",
  onSelectionChange,
}: Props) {
  const { t } = useI18n();
  const memberMap = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  const defaultSelectedUserIds = useMemo(() => {
    if (initialSelectedUserIds !== undefined) {
      return initialSelectedUserIds.filter((userId, index, arr) => arr.indexOf(userId) === index);
    }
    return members.map((member) => member.userId);
  }, [initialSelectedUserIds, members]);
  const [selectedUserIds, setSelectedUserIds] = useState(defaultSelectedUserIds);
  const [query, setQuery] = useState("");

  const selectedMembers = useMemo(
    () =>
      selectedUserIds
        .map((userId) => memberMap.get(userId))
        .filter((member): member is AssignmentAssigneeMember => member !== undefined),
    [memberMap, selectedUserIds],
  );
  const normalizedQuery = normalizeQuery(query);
  const searchResults = useMemo(() => {
    if (normalizedQuery.length === 0) return [];
    return members.filter((member) => {
      if (selectedUserIds.includes(member.userId)) return false;
      return normalizeQuery(member.nickname).includes(normalizedQuery);
    });
  }, [members, normalizedQuery, selectedUserIds]);

  useEffect(() => {
    onSelectionChange?.(selectedUserIds);
  }, [onSelectionChange, selectedUserIds]);

  const addAssignee = (userId: string) => {
    if (!memberMap.has(userId)) return;
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    setQuery("");
  };

  const removeAssignee = (userId: string) => {
    setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
  };

  const addFirstMatch = () => {
    if (searchResults.length > 0) {
      addAssignee(searchResults[0].userId);
      return;
    }
    const exactMatch = members.find((member) => {
      if (selectedUserIds.includes(member.userId)) return false;
      return normalizeQuery(member.nickname) === normalizedQuery;
    });
    if (exactMatch !== undefined) addAssignee(exactMatch.userId);
  };

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
        <span className={styles.label}>{t("assignment.assignee.label")}</span>
        <div className={styles.quickActions}>
          <Chip type="button" onClick={() => setSelectedUserIds(members.map((member) => member.userId))}>
            {t("assignment.assignee.all")}
          </Chip>
          <Chip type="button" onClick={() => setSelectedUserIds([meUserId])}>
            {t("assignment.assignee.self")}
          </Chip>
        </div>
      </div>

      <div className={styles.selectedWrap}>
        {selectedMembers.map((member) => (
          <span key={member.userId} className={styles.selectedChip}>
            <UserAvatar nickname={member.nickname} imageUrl={member.profileImageUrl} size={24} />
            <span className={styles.selectedLabel}>{member.nickname}</span>
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => removeAssignee(member.userId)}
              aria-label={`${member.nickname} 제거`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6.8531 6.08209C6.69528 6.11206 6.54728 6.18049 6.42222 6.28131C6.29715 6.38213 6.19888 6.51223 6.1361 6.66009C6.0461 6.87109 6.0491 7.26009 6.1411 7.46309C6.1891 7.56909 6.9271 8.33709 8.3961 9.81009L10.5781 12.0001L8.3961 14.1901C6.9291 15.6621 6.1891 16.4311 6.1411 16.5371C6.0501 16.7371 6.0481 17.1271 6.1371 17.3401C6.2271 17.5541 6.4211 17.7531 6.6371 17.8501C6.8651 17.9531 7.2481 17.9571 7.4631 17.8591C7.5691 17.8111 8.3381 17.0711 9.8101 15.6041L12.0001 13.4221L14.1901 15.6041C15.6621 17.0711 16.4311 17.8111 16.5371 17.8591C16.7521 17.9571 17.1351 17.9531 17.3631 17.8501C17.5791 17.7531 17.7731 17.5541 17.8631 17.3401C17.9521 17.1271 17.9501 16.7371 17.8591 16.5371C17.8111 16.4311 17.0711 15.6621 15.6041 14.1901L13.4221 12.0001L15.6041 9.81009C17.0711 8.33809 17.8111 7.56909 17.8591 7.46309C17.9571 7.24809 17.9531 6.86509 17.8501 6.63709C17.7458 6.41446 17.5647 6.23692 17.3401 6.13709C17.1271 6.04809 16.7371 6.05009 16.5371 6.14109C16.4311 6.18909 15.6621 6.92909 14.1901 8.39609L12.0001 10.5781L9.8101 8.39609C8.4511 7.04109 7.5671 6.18909 7.4801 6.15109C7.28217 6.06794 7.06437 6.04397 6.8531 6.08209Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && query.trim().length === 0) {
              const lastUserId = selectedUserIds.at(-1);
              if (lastUserId !== undefined) removeAssignee(lastUserId);
              return;
            }
            if (event.key !== "Enter" && event.key !== ",") return;
            event.preventDefault();
            addFirstMatch();
          }}
          placeholder={t("assignment.assignee.placeholder")}
          className={styles.input}
        />
      </div>

      {normalizedQuery.length > 0 ? (
        <div className={styles.dropdown}>
          {searchResults.length > 0 ? (
            searchResults.map((member) => (
              <button
                key={member.userId}
                type="button"
                className={styles.dropdownItem}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addAssignee(member.userId);
                }}
              >
                <UserAvatar nickname={member.nickname} imageUrl={member.profileImageUrl} size={28} />
                <span>{member.nickname}</span>
              </button>
            ))
          ) : (
            <div className={styles.emptyState}>{t("assignment.assignee.noResults")}</div>
          )}
        </div>
      ) : null}

      <div className={styles.summary}>
        {t("assignment.assignee.summary", { count: selectedUserIds.length })}
      </div>

      {selectedUserIds.map((userId) => (
        <input key={userId} type="hidden" name={inputName} value={userId} />
      ))}
    </div>
  );
}
