"use client";

// 과제 수정/메타데이터/삭제 폼 컴포넌트입니다.
import { useState } from "react";
import type {
  AssignmentDto,
  DeletionImpact,
} from "../../../../../../src/assignments/server";
import { useI18n } from "../../../../../../src/i18n/I18nProvider";
import { Button } from "../../../../../../src/ui/Button";
import { Icon } from "../../../../../../src/ui/Icon";
import { SubmitButton } from "../../../../../../src/ui/SubmitButton";
import { Modal } from "../../../../../../src/ui/Modal";
import { SegmentedControl } from "../../../../../../src/ui/SegmentedControl";
import { Switch } from "../../../../../../src/ui/Switch";
import { GroupSubnavCluster } from "../../../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../../../GroupRouteBreadcrumbs";
import styles from "./AssignmentSettingsClient.module.css";

type Actions = {
  update: (formData: FormData) => Promise<void>;
  autofill: (problemUrl: string) => Promise<{ title: string; hint: string; algorithms: string[]; difficulty: string }>;
  deleteAssignment: (formData: FormData) => Promise<void>;
};

type Props = {
  groupId: string;
  assignment: AssignmentDto;
  impact: DeletionImpact;
  actions: Actions;
};

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AssignmentSettingsClient({ groupId, assignment, impact, actions }: Props) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [title, setTitle] = useState(assignment.title);
  const [problemUrl, setProblemUrl] = useState(assignment.problemUrl);
  const [hint, setHint] = useState(assignment.hintPlain);
  const [difficulty, setDifficulty] = useState(assignment.difficulty ?? assignment.metadata.difficulty ?? "");
  const [scheduleMode, setScheduleMode] = useState<"days" | "weekday">("days");
  const [periodDays, setPeriodDays] = useState("7");
  const [weekday, setWeekday] = useState("2");
  const [dueAtLocal, setDueAtLocal] = useState(toLocalDateTimeInput(assignment.dueAt));
  const [algorithms, setAlgorithms] = useState(
    (assignment.metadata.algorithms ?? []).join(", "),
  );
  const [hintHiddenUntilSubmit, setHintHiddenUntilSubmit] = useState(
    assignment.metadata.hintHiddenUntilSubmit ?? true,
  );
  const [algorithmsHiddenUntilSubmit, setAlgorithmsHiddenUntilSubmit] = useState(
    assignment.metadata.algorithmsHiddenUntilSubmit ?? true,
  );
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);

  const counts = {
    sub: impact.submissionCount,
    rev: impact.reviewCount,
    cmt: impact.commentCount,
  };

  const inferAutofill = async () => {
    try {
      setAutofillLoading(true);
      setAutoFillError(null);
      const result = await actions.autofill(problemUrl);
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
              <section className={styles.scheduleSection}>
                <h3 className={styles.sectionTitle}>{t("assignment.new.scheduleTitle")}</h3>
                <div
                  className={styles.modeWrap}
                  onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.name !== "scheduleMode" || !target.checked) return;
                    setScheduleMode(target.value as "days" | "weekday");
                  }}
                >
                  <SegmentedControl
                    name="scheduleMode"
                    defaultValue="days"
                    aria-label={t("assignment.new.scheduleModeLabel")}
                    options={[
                      { value: "days", label: t("assignment.new.scheduleMode.days") },
                      { value: "weekday", label: t("assignment.new.scheduleMode.weekday") },
                    ]}
                  />
                </div>

                {scheduleMode === "days" ? (
                  <div
                    className={styles.modeWrap}
                    onChange={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (target.name === "periodDays" && target.checked) setPeriodDays(target.value);
                    }}
                  >
                    <label className={styles.modeLabel}>{t("assignment.new.periodDaysLabel")}</label>
                    <SegmentedControl
                      name="periodDays"
                      defaultValue="7"
                      value={periodDays}
                      aria-label={t("assignment.new.periodDaysLabel")}
                      options={[
                        { value: "1", label: t("assignment.new.periodDaysOption", { days: "1" }) },
                        { value: "3", label: t("assignment.new.periodDaysOption", { days: "3" }) },
                        { value: "7", label: t("assignment.new.periodDaysOption", { days: "7" }) },
                        { value: "14", label: t("assignment.new.periodDaysOption", { days: "14" }) },
                      ]}
                    />
                  </div>
                ) : (
                  <div
                    className={styles.modeWrap}
                    onChange={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (target.name === "weekday" && target.checked) setWeekday(target.value);
                    }}
                  >
                    <label className={styles.modeLabel}>{t("assignment.new.weekdayLabel")}</label>
                    <SegmentedControl
                      name="weekday"
                      defaultValue="2"
                      value={weekday}
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
                    />
                  </div>
                )}

                <label className={styles.label}>
                  {t("assignment.settings.fieldDue")}
                  <input
                    name="dueAt"
                    type="datetime-local"
                    value={dueAtLocal}
                    onChange={(e) => setDueAtLocal(e.target.value)}
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
            <SubmitButton variant="primary">{t("assignment.settings.save")}</SubmitButton>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <Button type="button" variant="danger" onClick={() => setConfirmOpen(true)}>
          {t("assignment.settings.deleteBtn")}
        </Button>
      </section>

      <Modal
        open={confirmOpen}
        title={t("assignment.settings.modalTitle")}
        onClose={() => setConfirmOpen(false)}
        footer={
          <div className={styles.modalFooter}>
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("assignment.settings.modalCancel")}
            </Button>
            <form action={actions.deleteAssignment}>
              <input type="hidden" name="confirmTitle" value={assignment.title} />
              <SubmitButton variant="danger">
                {t("assignment.settings.modalConfirm")}
              </SubmitButton>
            </form>
          </div>
        }
      >
        <p style={{ margin: 0 }}>
          {t("assignment.settings.modalBody", { title: assignment.title, ...counts })}
        </p>
      </Modal>
    </div>
  );
}
