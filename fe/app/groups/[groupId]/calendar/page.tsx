// 그룹 캘린더 골격 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../src/auth/api.server";
import { listAssignments } from "../../../../src/assignments/server";
import { getGroup, listGroupMembers } from "../../../../src/groups/server";
import {
  createKstPseudoDate,
  formatKstPseudoDateKey,
  fromKstPseudoDateToUtcIso,
  getKstDateKey,
  toKstPseudoDate,
} from "../../../../src/i18n/formatDateTime";
import { listSubmissions } from "../../../../src/submissions/server";
import { AppShell } from "../../../../src/shell/AppShell";
import { ErrorState } from "../../../../src/ui/states/ErrorState";
import { GroupSubnavCluster } from "../GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "../GroupRouteBreadcrumbs";
import { GroupCalendarClient } from "./GroupCalendarClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ view?: string; date?: string }>;
};

const getStartOfWeek = (date: Date): Date => {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getMonthGridStart = (baseDate: Date): Date => {
  const first = createKstPseudoDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 1);
  return getStartOfWeek(first);
};

const parseDateParam = (value: string | undefined): Date => {
  const fallback = toKstPseudoDate(new Date());
  if (fallback === null) return createKstPseudoDate(1970, 1, 1);
  if (value === undefined) return fallback;
  const parsed = toKstPseudoDate(value);
  return parsed ?? fallback;
};

export default async function GroupCalendarPage({ params, searchParams }: Props) {
  const { groupId } = await params;
  const query = (await searchParams) ?? {};
  const me = await fetchMeServer();
  if (me === null) redirect("/login");

  try {
    const [group, members, assignments] = await Promise.all([
      getGroup(groupId),
      listGroupMembers(groupId),
      listAssignments(groupId),
    ]);
    const assignmentsWithSubmitter = await Promise.all(
      assignments.map(async (assignment) => {
        const submissions = await listSubmissions(assignment.id, { sort: "createdAtDesc" });
        const submitterIds = Array.from(new Set(submissions.map((submission) => submission.authorUserId)));
        const lateSubmitterIds = Array.from(
          new Set(submissions.filter((submission) => submission.isLate).map((submission) => submission.authorUserId)),
        );
        return {
          ...assignment,
          submitterIds,
          hasMySubmission: submitterIds.includes(me.id),
          hasLateSubmission:
            assignment.assigneeUserIds.length > 0
              ? assignment.assigneeUserIds.some((userId) => lateSubmitterIds.includes(userId))
              : lateSubmitterIds.length > 0,
        };
      }),
    );
    const baseDate = parseDateParam(query.date);
    const view = query.view === "week" ? "week" : "month";
    const canCreate = group.myRole === "OWNER" || group.myRole === "MANAGER";

    const grouped = assignmentsWithSubmitter.reduce<Record<string, typeof assignmentsWithSubmitter>>((acc, item) => {
      const key = getKstDateKey(item.dueAt);
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
    const monthStart = getMonthGridStart(baseDate);
    const monthDays = Array.from({ length: 42 }, (_, idx) => addDays(monthStart, idx));
    const weekStart = getStartOfWeek(baseDate);
    const weekDays = Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx));
    const days = view === "week" ? weekDays : monthDays;
    const prevDate =
      view === "week"
        ? addDays(baseDate, -7)
        : createKstPseudoDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1);
    const nextDate =
      view === "week"
        ? addDays(baseDate, 7)
        : createKstPseudoDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 2, 1);
    const todayKey = getKstDateKey(new Date());
    const isToday = (date: Date) => formatKstPseudoDateKey(date) === todayKey;

    const calendarCells = days.map((day) => {
      const key = formatKstPseudoDateKey(day);
      const items = grouped[key] ?? [];
      const isOutsideMonth = view === "month" && day.getUTCMonth() !== baseDate.getUTCMonth();
      return {
        dateKey: key,
        dateIso: `${key}T00:00:00.000Z`,
        dueDateForNew: key,
        dayNumber: day.getUTCDate(),
        isOutsideMonth,
        isToday: isToday(day),
        assignments: items.map((a) => ({
          id: a.id,
          title: a.title,
          dueAt: a.dueAt,
          platform: a.platform,
          difficulty: a.difficulty,
          analysisStatus: a.analysisStatus,
          algorithms:
            (a.metadata.algorithmsHiddenUntilSubmit ?? true) && a.hasMySubmission !== true
              ? []
              : (a.metadata.algorithms ?? []),
          submitterIds: a.submitterIds,
          hasMySubmission: a.hasMySubmission ?? false,
          hasLateSubmission: a.hasLateSubmission ?? false,
          assigneeUserIds: a.assigneeUserIds,
          assignees: a.assignees,
          solvedAssignees: a.assignees.filter((assignee) => a.submitterIds.includes(assignee.userId)),
          unsolvedAssignees: a.assignees.filter((assignee) => !a.submitterIds.includes(assignee.userId)),
          isAssignedToMe: a.isAssignedToMe,
        })),
      };
    });

    return (
      <AppShell
        titleKey="groupCalendar.title"
        titleVars={{ name: group.name }}
        subtitleKey="groupCalendar.subtitle"
      >
        <div className={styles.root}>
          <GroupSubnavCluster groupId={groupId}>
            <GroupRouteBreadcrumbs groupId={groupId} />
          </GroupSubnavCluster>
          <section className={styles.calendarCard}>
            <GroupCalendarClient
              groupId={groupId}
              view={view}
              baseDateIso={fromKstPseudoDateToUtcIso(baseDate)}
              prevDateIso={fromKstPseudoDateToUtcIso(prevDate)}
              nextDateIso={fromKstPseudoDateToUtcIso(nextDate)}
              canCreate={canCreate}
              members={members}
              cells={calendarCells}
              gridClassName={view === "week" ? styles.weekGrid : styles.monthGrid}
            />
          </section>
        </div>
      </AppShell>
    );
  } catch (error) {
    return (
      <AppShell titleKey="groupCalendar.fallbackTitle">
        <ErrorState titleKey="groupCalendar.errorTitle" description={(error as Error).message} />
      </AppShell>
    );
  }
}
