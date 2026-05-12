"use client";

// 과제 수정/메타데이터/삭제 폼 컴포넌트입니다.
import { useState } from "react";
import type {
  AssignmentDto,
  DeletionImpact,
} from "../../../../../../src/assignments/server";
import {
  AssignmentAssigneePicker,
  isAssigneeSelectionValid,
  type AssignmentAssigneeMember,
} from "../../../../../../src/assignments/AssignmentAssigneePicker";
import { useI18n } from "../../../../../../src/i18n/I18nProvider";
import {
  formatKstPseudoDateTimeLocalInput,
  parseKstDateTimeLocalInput,
  toKstDateTimeLocalInput,
  toKstPseudoDate,
} from "../../../../../../src/i18n/formatDateTime";
import { Button } from "../../../../../../src/ui/Button";
import { Icon } from "../../../../../../src/ui/Icon";
import { Input } from "../../../../../../src/ui/Input";
import { SubmitButton } from "../../../../../../src/ui/SubmitButton";
import { Modal } from "../../../../../../src/ui/Modal";
import { SegmentedControl } from "../../../../../../src/ui/SegmentedControl";
import { Switch } from "../../../../../../src/ui/Switch";
import { GroupSubnavCluster } from "../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../GroupRouteBreadcrumbs";
import styles from "./AssignmentSettingsClient.module.css";

type Actions = {
  update: (formData: FormData) => Promise<void>;
  autofill: (
    problemUrl: string,
    uiLocale: string,
  ) => Promise<{ title: string; hint: string; algorithms: string[]; difficulty: string }>;
  deleteAssignment: (formData: FormData) => Promise<void>;
};

type Props = {
  groupId: string;
  assignment: AssignmentDto;
  impact: DeletionImpact;
  actions: Actions;
  members: AssignmentAssigneeMember[];
  meUserId: string;
  myRole: "OWNER" | "MANAGER";
};

const DAY_OPTIONS = ["1", "3", "7", "14"] as const;
const WEEKDAY_OPTIONS = ["1", "2", "3", "4", "5", "6", "7"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseTime = (time: string): { hour: number; minute: number } => {
  const [h, m] = time.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 23, minute: 59 };
  return { hour, minute };
};

const normalizeDueTime = (value: string): string => {
  const matched = /^(\d{2}):(\d{2})$/.exec(value);
  if (!matched) return "23:59";
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "23:59";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "23:59";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const extractTime = (localDateTime: string): string => {
  const parts = localDateTime.split("T");
  if (parts.length < 2) return "23:59";
  return parts[1].slice(0, 5);
};

const computeDueAtByDays = (days: string, dueTime: string): string => {
  const now = toKstPseudoDate(new Date());
  if (now === null) return "";
  const { hour, minute } = parseTime(dueTime);
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + Number(days));
  next.setUTCHours(hour, minute, 0, 0);
  return formatKstPseudoDateTimeLocalInput(next);
};

const computeDueAtByWeekday = (weekday: string, dueTime: string): string => {
  const now = toKstPseudoDate(new Date());
  if (now === null) return "";
  const { hour, minute } = parseTime(dueTime);
  const target = Number(weekday) % 7;
  const next = new Date(now);
  const diff = (target - now.getUTCDay() + 7) % 7;
  next.setUTCDate(now.getUTCDate() + diff);
  next.setUTCHours(hour, minute, 0, 0);
  if (diff === 0 && next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return formatKstPseudoDateTimeLocalInput(next);
};

function deriveScheduleSelection(localDateTime: string): {
  periodDays: (typeof DAY_OPTIONS)[number] | null;
  weekday: (typeof WEEKDAY_OPTIONS)[number] | null;
} {
  const now = toKstPseudoDate(new Date());
  const due = parseKstDateTimeLocalInput(localDateTime);
  if (now === null || due === null) {
    return { periodDays: null, weekday: null };
  }

  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { periodDays: null, weekday: null };
  }
  const diffDays = Math.ceil(diffMs / DAY_MS);
  const periodDays = DAY_OPTIONS.find((value) => Number(value) === diffDays) ?? null;
  const weekday =
    diffDays >= 8
      ? null
      : ((due.getUTCDay() === 0 ? "7" : String(due.getUTCDay())) as (typeof WEEKDAY_OPTIONS)[number]);
  return { periodDays, weekday };
}

export function AssignmentSettingsClient({
  groupId,
  assignment,
  impact,
  actions,
  members,
  meUserId,
  myRole,
}: Props) {
  const { t, locale } = useI18n();
  const initialDueAtLocal = toKstDateTimeLocalInput(assignment.dueAt);
  const initialSchedule = deriveScheduleSelection(initialDueAtLocal);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [title, setTitle] = useState(assignment.title);
  const [problemUrl, setProblemUrl] = useState(assignment.problemUrl);
  const [hint, setHint] = useState(assignment.hintPlain);
  const [difficulty, setDifficulty] = useState(assignment.difficulty ?? assignment.metadata.difficulty ?? "");
  const [scheduleMode, setScheduleMode] = useState<"days" | "weekday">("days");
  const [periodDays, setPeriodDays] = useState<(typeof DAY_OPTIONS)[number] | null>(initialSchedule.periodDays);
  const [weekday, setWeekday] = useState<(typeof WEEKDAY_OPTIONS)[number] | null>(initialSchedule.weekday);
  const [dueAtLocal, setDueAtLocal] = useState(initialDueAtLocal);
  const [algorithms, setAlgorithms] = useState(
    (assignment.metadata.algorithms ?? []).join(", "),
  );
  const [hintHiddenUntilSubmit, setHintHiddenUntilSubmit] = useState(
    assignment.metadata.hintHiddenUntilSubmit ?? true,
  );
  const [algorithmsHiddenUntilSubmit, setAlgorithmsHiddenUntilSubmit] = useState(
    assignment.metadata.algorithmsHiddenUntilSubmit ?? true,
  );
  const [selectedAssigneeUserIds, setSelectedAssigneeUserIds] = useState(
    assignment.assigneeUserIds,
  );
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);

  const counts = {
    sub: impact.submissionCount,
    rev: impact.reviewCount,
    cmt: impact.commentCount,
  };
  const hasRequiredFields =
    title.trim().length > 0 &&
    problemUrl.trim().length > 0 &&
    difficulty.trim().length > 0 &&
    algorithms
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0).length > 0;
  const isSaveDisabled =
    !hasRequiredFields || !isAssigneeSelectionValid(myRole, meUserId, selectedAssigneeUserIds);
  const isDeleteConfirmMatched = deleteConfirmTitle === assignment.title;

  const inferAutofill = async () => {
    try {
      setAutofillLoading(true);
      setAutoFillError(null);
      const result = await actions.autofill(problemUrl, locale);
      if (result.title.trim().length > 0) setTitle(result.title);
      if (result.hint.trim().length > 0) setHint(result.hint);
      if (result.difficulty.trim().length > 0) setDifficulty(result.difficulty);
      // AI 자동 채우기에서는 기존 알고리즘을 유지하지 않고 새 결과로 덮어쓴다.
      setAlgorithms(result.algorithms.join(", "));
    } catch (error) {
      setAutoFillError((error as Error).message);
      window.setTimeout(() => setAutoFillError(null), 2600);
    } finally {
      setAutofillLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <GroupSubnavCluster groupId={groupId}>
        <GroupRouteBreadcrumbs groupId={groupId} assignmentTitle={assignment.title} />
      </GroupSubnavCluster>
      <section className={styles.section}>
        <form action={actions.update} className={styles.form}>
          <div className={styles.contentSplit}>
            <div className={styles.leftCol}>
              <label className={styles.label}>
                {t("assignment.settings.fieldTitle")}
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  className={styles.input}
                />
              </label>
              <label className={styles.label}>
                {t("assignment.settings.fieldUrl")}
                <div className={styles.urlRow}>
                  <input
                    name="problemUrl"
                    type="url"
                    value={problemUrl}
                    onChange={(e) => setProblemUrl(e.target.value)}
                    required
                    className={styles.input}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={inferAutofill}
                    loading={autofillLoading}
                    leftIcon={<Icon name="sparkles" size={16} />}
                  >
                    {t("assignment.new.autoFill")}
                  </Button>
                </div>
                {autoFillError !== null ? <span className={styles.toastError}>{autoFillError}</span> : null}
              </label>
              <label className={styles.label}>
                {t("assignment.new.fieldDifficulty")}
                <input
                  name="difficulty"
                  maxLength={50}
                  className={styles.input}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  placeholder={t("assignment.new.fieldDifficultyPlaceholder")}
                />
              </label>
              <label className={styles.label}>
                {t("assignment.new.fieldAlgorithms")}
                <span className={styles.visibilityHint}>
                  {algorithmsHiddenUntilSubmit
                    ? t("assignment.new.visibilityPrivateStatus")
                    : t("assignment.new.visibilityPublicStatus")}
                </span>
                <input
                  name="algorithmsVisible"
                  value={algorithms}
                  onChange={(e) => setAlgorithms(e.target.value)}
                  className={`${styles.input} ${algorithmsHiddenUntilSubmit ? styles.privateField : styles.publicField}`}
                />
              </label>
              <input type="hidden" name="algorithms" value={algorithms} />
              <label className={`${styles.label} ${styles.descLabel}`}>
                {t("assignment.settings.fieldHint")}
                <span className={styles.visibilityHint}>
                  {hintHiddenUntilSubmit
                    ? t("assignment.new.visibilityPrivateStatus")
                    : t("assignment.new.visibilityPublicStatus")}
                </span>
                <textarea
                  name="hint"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  rows={4}
                  className={`${styles.textarea} ${hintHiddenUntilSubmit ? styles.privateField : styles.publicField}`}
                />
              </label>
            </div>

            <div className={styles.rightCol}>
              <AssignmentAssigneePicker
                members={members}
                meUserId={meUserId}
                initialSelectedUserIds={assignment.assigneeUserIds}
                onSelectionChange={setSelectedAssigneeUserIds}
              />
              <section className={styles.scheduleSection}>
                <h3 className={styles.sectionTitle}>{t("assignment.new.scheduleTitle")}</h3>
                <div
                  className={styles.modeWrap}
                >
                  <SegmentedControl
                    name="scheduleMode"
                    defaultValue="days"
                    value={scheduleMode}
                    aria-label={t("assignment.new.scheduleModeLabel")}
                    options={[
                      { value: "days", label: t("assignment.new.scheduleMode.days") },
                      { value: "weekday", label: t("assignment.new.scheduleMode.weekday") },
                    ]}
                    onValueChange={(value) => {
                      const nextMode = value as "days" | "weekday";
                      setScheduleMode(nextMode);
                      const currentTime = normalizeDueTime(extractTime(dueAtLocal));
                      if (nextMode === "days" && periodDays !== null) {
                        setDueAtLocal(computeDueAtByDays(periodDays, currentTime));
                      }
                      if (nextMode === "weekday" && weekday !== null) {
                        setDueAtLocal(computeDueAtByWeekday(weekday, currentTime));
                      }
                    }}
                  />
                </div>

                {scheduleMode === "days" ? (
                  <div className={styles.modeWrap}>
                    <label className={styles.modeLabel}>{t("assignment.new.periodDaysLabel")}</label>
                    <SegmentedControl
                      name="periodDays"
                      defaultValue="7"
                      value={periodDays ?? ""}
                      aria-label={t("assignment.new.periodDaysLabel")}
                      options={[
                        { value: "1", label: t("assignment.new.periodDaysOption", { days: "1" }) },
                        { value: "3", label: t("assignment.new.periodDaysOption", { days: "3" }) },
                        { value: "7", label: t("assignment.new.periodDaysOption", { days: "7" }) },
                        { value: "14", label: t("assignment.new.periodDaysOption", { days: "14" }) },
                      ]}
                      onValueChange={(value) => {
                        const currentTime = normalizeDueTime(extractTime(dueAtLocal));
                        setPeriodDays(value as (typeof DAY_OPTIONS)[number]);
                        setDueAtLocal(computeDueAtByDays(value, currentTime));
                      }}
                    />
                  </div>
                ) : (
                  <div className={styles.modeWrap}>
                    <label className={styles.modeLabel}>{t("assignment.new.weekdayLabel")}</label>
                    <SegmentedControl
                      name="weekday"
                      defaultValue="2"
                      value={weekday ?? ""}
                      aria-label={t("assignment.new.weekdayLabel")}
                      options={[
                        { value: "1", label: t("assignment.new.weekdayOption.1") },
                        { value: "2", label: t("assignment.new.weekdayOption.2") },
                        { value: "3", label: t("assignment.new.weekdayOption.3") },
                        { value: "4", label: t("assignment.new.weekdayOption.4") },
                        { value: "5", label: t("assignment.new.weekdayOption.5") },
                        { value: "6", label: t("assignment.new.weekdayOption.6") },
                        { value: "7", label: t("assignment.new.weekdayOption.7") },
                      ]}
                      className={styles.weekdaySegment}
                      onValueChange={(value) => {
                        const currentTime = normalizeDueTime(extractTime(dueAtLocal));
                        setWeekday(value as (typeof WEEKDAY_OPTIONS)[number]);
                        setDueAtLocal(computeDueAtByWeekday(value, currentTime));
                      }}
                    />
                  </div>
                )}

                <label className={styles.label}>
                  {t("assignment.settings.fieldDue")}
                  <input
                    name="dueAt"
                    type="datetime-local"
                    lang="en-GB"
                    value={dueAtLocal}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDueAtLocal(nextValue);
                      const nextSchedule = deriveScheduleSelection(nextValue);
                      setPeriodDays(nextSchedule.periodDays);
                      setWeekday(nextSchedule.weekday);
                    }}
                    className={styles.input}
                  />
                </label>
              </section>

              <Switch name="allowLateSubmission" defaultChecked={assignment.allowLateSubmission}>
                {t("assignment.settings.fieldLate")}
              </Switch>
              <div className={styles.visibilitySwitches}>
                <Switch
                  name="algorithmsHiddenUntilSubmit"
                  checked={algorithmsHiddenUntilSubmit}
                  onCheckedChange={setAlgorithmsHiddenUntilSubmit}
                >
                  {t("assignment.new.algorithmsVisibilityPrivate")}
                </Switch>
                <Switch
                  name="hintHiddenUntilSubmit"
                  checked={hintHiddenUntilSubmit}
                  onCheckedChange={setHintHiddenUntilSubmit}
                >
                  {t("assignment.new.hintVisibilityPrivate")}
                </Switch>
              </div>
            </div>
          </div>
          <div className={styles.submitRow}>
            <SubmitButton variant="primary" disabled={isSaveDisabled}>
              {t("assignment.settings.save")}
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setDeleteConfirmTitle("");
            setConfirmOpen(true);
          }}
        >
          {t("assignment.settings.deleteBtn")}
        </Button>
      </section>

      <Modal
        open={confirmOpen}
        title={t("assignment.settings.modalTitle")}
        onClose={() => {
          setConfirmOpen(false);
          setDeleteConfirmTitle("");
        }}
        footer={
          <div className={styles.modalFooter}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmOpen(false);
                setDeleteConfirmTitle("");
              }}
            >
              {t("assignment.settings.modalCancel")}
            </Button>
            <form action={actions.deleteAssignment}>
              <input type="hidden" name="confirmTitle" value={deleteConfirmTitle} />
              <SubmitButton variant="danger" disabled={!isDeleteConfirmMatched}>
                {t("assignment.settings.modalConfirm")}
              </SubmitButton>
            </form>
          </div>
        }
      >
        <div className={styles.modalBody}>
          <p className={styles.modalText}>
            {t("assignment.settings.modalBody", { title: assignment.title, ...counts })}
          </p>
          <Input
            value={deleteConfirmTitle}
            onChange={(event) => setDeleteConfirmTitle(event.target.value)}
            placeholder={assignment.title}
            label={t("assignment.settings.modalInputLabel", { title: assignment.title })}
          />
        </div>
      </Modal>
    </div>
  );
}
