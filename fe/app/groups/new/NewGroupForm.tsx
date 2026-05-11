"use client";

// 새 그룹 만들기 폼입니다.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { Icon } from "../../../src/ui/Icon";
import { SegmentedControl } from "../../../src/ui/SegmentedControl";
import { Switch } from "../../../src/ui/Switch";
import { SubmitButton } from "../../../src/ui/SubmitButton";
import styles from "./NewGroupForm.module.css";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

export function NewGroupForm({ action }: Props) {
  const { t } = useI18n();
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [creatorRole, setCreatorRole] = useState("OWNER_AND_MANAGER");

  const displayTime = deadlineTime.length > 0 ? deadlineTime : "23:59";

  const roleOptions = useMemo(
    () => [
      { value: "OWNER_ONLY", label: t("groupNew.rules.creator.ownerOnly") },
      { value: "OWNER_AND_MANAGER", label: t("groupNew.rules.creator.both") },
    ],
    [t],
  );

  return (
    <form action={action} className={styles.root}>
      <div className={styles.basicJoinRow}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("groupNew.basic.title")}</h2>
          <div className={styles.basicGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t("groupNew.basic.name")} <span className={styles.req}>*</span>
              </span>
              <input
                name="name"
                required
                maxLength={20}
                className={styles.input}
                placeholder={t("groupNew.basic.namePlaceholder")}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t("groupNew.basic.maxMembers")}</span>
              <input
                name="maxMembers"
                type="number"
                min={2}
                max={50}
                defaultValue={10}
                className={styles.input}
              />
            </label>
            <label className={`${styles.field} ${styles.spanWide}`}>
              <span className={styles.fieldLabel}>{t("groupNew.basic.description")}</span>
              <textarea
                name="description"
                maxLength={500}
                rows={3}
                className={styles.textarea}
                placeholder={t("groupNew.basic.descriptionPlaceholder")}
              />
            </label>
          </div>
        </section>

        <section className={`${styles.section} ${styles.joinSection}`}>
          <h2 className={styles.sectionTitle}>{t("groupNew.join.title")}</h2>
          <div className={styles.toggleStack}>
            <Switch name="joinByCodeEnabled" defaultChecked icon={<Icon name="key" size={16} />}>
              {t("groupNew.join.code")}
            </Switch>
            <Switch name="joinByLinkEnabled" defaultChecked icon={<Icon name="link" size={16} />}>
              {t("groupNew.join.link")}
            </Switch>
          </div>
        </section>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("groupNew.rules.title")}</h2>

        <div className={styles.rulesGrid}>
          <div className={styles.captioned}>
            <Switch name="ruleUseDeadline">{t("groupNew.rules.useDeadline")}</Switch>
            <span className={`${styles.caption} ${styles.capOn}`}>
              {t("groupNew.rules.deadlineOn")}
            </span>
            <span className={`${styles.caption} ${styles.capOff}`}>
              {t("groupNew.rules.deadlineOff")}
            </span>
          </div>
          <div className={`${styles.captioned} ${styles.deadlineDep}`}>
            <input
              name="ruleDefaultDeadlineTime"
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              className={styles.input}
              aria-label={t("groupNew.rules.deadlineLabel")}
            />
            <span className={styles.caption}>
              {t("groupNew.rules.deadlineCaption", { time: displayTime })}
            </span>
          </div>
          <div className={`${styles.captioned} ${styles.deadlineDep}`}>
            <Switch name="ruleAllowLateSubmission" defaultChecked>
              {t("groupNew.rules.allowLate")}
            </Switch>
            <span className={`${styles.caption} ${styles.lateOn}`}>
              {t("groupNew.rules.lateOn")}
            </span>
            <span className={`${styles.caption} ${styles.lateOff}`}>
              {t("groupNew.rules.lateOff")}
            </span>
          </div>

          <Switch name="ruleUseAiFeedback" defaultChecked>
            {t("groupNew.rules.ai")}
          </Switch>
          <div className={styles.captioned}>
            <Switch name="ruleAllowEditAfterSubmit" defaultChecked>
              {t("groupNew.rules.editAfter")}
            </Switch>
            <span className={`${styles.caption} ${styles.editOn}`}>
              {t("groupNew.rules.editAfterOn")}
            </span>
            <span className={`${styles.caption} ${styles.editOff}`}>
              {t("groupNew.rules.editAfterOff")}
            </span>
          </div>
          <div
            className={styles.captioned}
            onChange={(e) => {
              const target = e.target as HTMLInputElement;
              if (target.name === "ruleAssignmentCreatorRoles" && target.checked) {
                setCreatorRole(target.value);
              }
            }}
          >
            <SegmentedControl
              name="ruleAssignmentCreatorRoles"
              defaultValue="OWNER_AND_MANAGER"
              aria-label={t("groupNew.rules.creator.both")}
              options={roleOptions}
            />
            <span className={styles.caption}>
              {creatorRole === "OWNER_ONLY"
                ? t("groupNew.rules.creator.captionOwnerOnly")
                : t("groupNew.rules.creator.captionBoth")}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        <Link href="/groups" className={styles.cancel}>
          {t("groupNew.actions.cancel")}
        </Link>
        <SubmitButton variant="primary">
          {t("groupNew.actions.submit")}
        </SubmitButton>
      </div>
    </form>
  );
}
