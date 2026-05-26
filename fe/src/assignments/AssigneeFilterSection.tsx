// 과제 필터 모달의 대상자 선택·OR/AND 매칭 UI입니다.
"use client";

import { useI18n } from "../i18n/I18nProvider";
import { Chip } from "../ui/Chip";
import type { AssigneeMatchMode } from "./assignmentAssigneeDisplay";

type AssigneeOption = {
  userId: string;
  nickname: string;
};

type ClassNames = {
  section: string;
  label: string;
  chipRow: string;
};

type Props = {
  classNames: ClassNames;
  assigneeOptions: AssigneeOption[];
  selectedAssigneeIds: string[];
  assigneeMatchMode: AssigneeMatchMode;
  onChange: (next: {
    selectedAssigneeIds: string[];
    assigneeMatchMode: AssigneeMatchMode;
  }) => void;
};

export function AssigneeFilterSection({
  classNames,
  assigneeOptions,
  selectedAssigneeIds,
  assigneeMatchMode,
  onChange,
}: Props) {
  const { t } = useI18n();
  const showMatchMode = selectedAssigneeIds.length >= 2;

  const toggleAssignee = (userId: string) => {
    const nextIds = selectedAssigneeIds.includes(userId)
      ? selectedAssigneeIds.filter((id) => id !== userId)
      : [...selectedAssigneeIds, userId];
    onChange({
      selectedAssigneeIds: nextIds,
      assigneeMatchMode: nextIds.length < 2 ? "any" : assigneeMatchMode,
    });
  };

  return (
    <div className={classNames.section}>
      <p className={classNames.label}>{t("assignment.list.assignee")}</p>
      <div className={classNames.chipRow}>
        {assigneeOptions.map((member) => (
          <Chip
            key={member.userId}
            active={selectedAssigneeIds.includes(member.userId)}
            onClick={() => toggleAssignee(member.userId)}
          >
            {member.nickname}
          </Chip>
        ))}
      </div>
      {showMatchMode ? (
        <div className={classNames.chipRow}>
          <Chip
            active={assigneeMatchMode === "any"}
            onClick={() => onChange({ selectedAssigneeIds, assigneeMatchMode: "any" })}
          >
            {t("assignment.list.assigneeMatchAny")}
          </Chip>
          <Chip
            active={assigneeMatchMode === "all"}
            onClick={() => onChange({ selectedAssigneeIds, assigneeMatchMode: "all" })}
          >
            {t("assignment.list.assigneeMatchAll")}
          </Chip>
        </div>
      ) : null}
    </div>
  );
}
