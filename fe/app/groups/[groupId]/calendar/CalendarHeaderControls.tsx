"use client";

// 캘린더 헤더 이동/뷰 전환/과제 만들기 컨트롤입니다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import { SegmentedControl } from "../../../../src/ui/SegmentedControl";
import { Button } from "../../../../src/ui/Button";
import { Icon } from "../../../../src/ui/Icon";
import styles from "./page.module.css";

type Props = {
  groupId: string;
  view: "week" | "month";
  baseDateIso: string;
  prevDateIso: string;
  nextDateIso: string;
  periodLabel: string;
  canCreate: boolean;
  activeFilterCount: number;
  onOpenFilter: () => void;
};

export function CalendarHeaderControls({
  groupId,
  view,
  baseDateIso,
  prevDateIso,
  nextDateIso,
  periodLabel,
  canCreate,
  activeFilterCount,
  onOpenFilter,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <div className={styles.headerActions}>
      <div className={styles.periodNav}>
        <Link
          href={`/groups/${groupId}/calendar?view=${view}&date=${prevDateIso}`}
          className={styles.iconNavBtn}
          aria-label={t("groupCalendar.prev")}
        >
          <Icon name="chevronRight" size={16} className={styles.chevronLeft} />
        </Link>
        <strong className={styles.periodLabel}>{periodLabel}</strong>
        <Link
          href={`/groups/${groupId}/calendar?view=${view}&date=${nextDateIso}`}
          className={styles.iconNavBtn}
          aria-label={t("groupCalendar.next")}
        >
          <Icon name="chevronRight" size={16} />
        </Link>
      </div>

      <div className={styles.rightActions}>
        <Link href={`/groups/${groupId}/calendar?view=${view}&date=${new Date().toISOString()}`} className={styles.todayLink}>
          {t("groupCalendar.today")}
        </Link>

        <div
          className={styles.viewSegmentWrap}
          onChange={(e) => {
            const target = e.target as HTMLInputElement;
            if (target.name !== "calendarView" || !target.checked) return;
            router.push(`/groups/${groupId}/calendar?view=${target.value}&date=${baseDateIso}`);
          }}
        >
          <SegmentedControl
            name="calendarView"
            defaultValue={view}
            aria-label={t("groupCalendar.viewAria")}
            options={[
              { value: "week", label: t("groupCalendar.week") },
              { value: "month", label: t("groupCalendar.month") },
            ]}
          />
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={onOpenFilter}
          leftIcon={<Icon name="filter" size={16} />}
        >
          {t("assignment.list.filter")}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>

        {canCreate ? (
          <Link href={`/groups/${groupId}/assignments/new`} className={styles.createBtnLink}>
            <Button type="button" variant="primary">{t("assignment.list.create")}</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
