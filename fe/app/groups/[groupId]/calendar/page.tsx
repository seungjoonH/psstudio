// 그룹 캘린더 골격 페이지입니다.
import { redirect } from "next/navigation";
import { fetchMeServer } from "../../../../src/auth/api.server";
import { listAssignments } from "../../../../src/assignments/server";
import { getGroup, listGroupMembers } from "../../../../src/groups/server";
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

const dayKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toDateOnly = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getStartOfWeek = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getMonthGridStart = (baseDate: Date): Date => {
  const first = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  return getStartOfWeek(first);
};

const parseDateParam = (value: string | undefined): Date => {
  if (value === undefined) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
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
      const key = dayKey(new Date(item.dueAt));
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
    const monthStart = getMonthGridStart(baseDate);
    const monthDays = Array.from({ length: 42 }, (_, idx) => addDays(monthStart, idx));
    const weekStart = getStartOfWeek(baseDate);
    const weekDays = Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx));
    const days = view === "week" ? weekDays : monthDays;
    const prevDate = view === "week" ? addDays(baseDate, -7) : new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
    const nextDate = view === "week" ? addDays(baseDate, 7) : new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
    const isToday = (date: Date) => dayKey(date) === dayKey(new Date());

    const calendarCells = days.map((day) => {
      const key = dayKey(day);
      const items = grouped[key] ?? [];
      const isOutsideMonth = view === "month" && day.getMonth() !== baseDate.getMonth();
      return {
        dateKey: key,
        dateIso: day.toISOString(),
        dueDateForNew: toDateOnly(day),
        dayNumber: day.getDate(),
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
              baseDateIso={baseDate.toISOString()}
              prevDateIso={prevDate.toISOString()}
              nextDateIso={nextDate.toISOString()}
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
