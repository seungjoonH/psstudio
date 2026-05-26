"use client";
// 과제 대상자 선택 UI를 렌더링하는 공용 컴포넌트입니다.

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";
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
              <Icon name="close" size={16} />
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
