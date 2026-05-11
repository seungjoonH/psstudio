// 홈 화면입니다.
import { redirect } from "next/navigation";
import {
  fetchMeServer,
  fetchRecentNotificationsServer,
  fetchRecentSubmissionsServer,
} from "../src/auth/api.server";
import { listAssignments } from "../src/assignments/server";
import { ENV } from "../src/config/env";
import { listMyGroups } from "../src/groups/server";
import { AppShell } from "../src/shell/AppShell";
import { listSubmissions } from "../src/submissions/server";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";

const HOME_KANBAN_LIST_LIMIT = 4;
/** 히어로「한 일」통계·칸반 열은 **지난 7일** 안에 생성된 제출만 대상으로 합니다. BE `limit` 상한(20)까지 불러온 뒤 칸반에는 최신순 앞쪽만 씁니다. */
const HOME_SUBMISSIONS_FETCH_CAP = 20;
const HOME_DONE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** 칸반 '해야 할 일': 마감 지난 항목 우선, 그다음 마감일 임박 순(동일 시 최근 생성 우선). */
function compareHomeKanbanTodoUrgency(
  a: { dueAt: string; createdAt: string },
  b: { dueAt: string; createdAt: string },
  nowMs: number,
): number {
  const aDue = new Date(a.dueAt).getTime();
  const bDue = new Date(b.dueAt).getTime();
  const aLate = aDue < nowMs;
  const bLate = bDue < nowMs;
  if (aLate !== bLate) return aLate ? -1 : 1;
  if (aDue !== bDue) return aDue - bDue;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export default async function HomePage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");
  const homeDoneCreatedAfterIso = new Date(Date.now() - HOME_DONE_LOOKBACK_MS).toISOString();
  const [notificationsRaw, submissionsRaw, groups] = await Promise.all([
    fetchRecentNotificationsServer(HOME_KANBAN_LIST_LIMIT),
    fetchRecentSubmissionsServer(HOME_SUBMISSIONS_FETCH_CAP, { createdAfter: homeDoneCreatedAfterIso }),
    listMyGroups(),
  ]);
  const notifications = [...notificationsRaw].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const submissionsSorted = [...submissionsRaw].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const submissions = submissionsSorted.slice(0, HOME_KANBAN_LIST_LIMIT);
  const submissionCount = submissionsSorted.length;
  const assignmentChunks = await Promise.all(
    groups.map(async (group) => ({
      groupId: group.id,
      groupName: group.name,
      items: await listAssignments(group.id),
    })),
  );
  const todoPending = (
    await Promise.all(
      assignmentChunks
        .flatMap((chunk) =>
          chunk.items.map((item) => ({
            ...item,
            groupId: chunk.groupId,
            groupName: chunk.groupName,
          })),
        )
        .map(async (item) => {
          const mine = await listSubmissions(item.id, { authorId: me.id, sort: "createdAtDesc" });
          return { ...item, hasMySubmission: mine.length > 0 };
        }),
    )
  ).filter((item) => !item.hasMySubmission);
  const todoTotal = todoPending.length;
  const nowMs = Date.now();
  const todoItems = [...todoPending]
    .sort((a, b) => compareHomeKanbanTodoUrgency(a, b, nowMs))
    .slice(0, HOME_KANBAN_LIST_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.title,
      groupName: item.groupName,
      platform: item.platform,
      difficulty: item.difficulty,
      algorithms: item.metadata?.algorithms ?? [],
      algorithmsHiddenUntilSubmit: item.metadata?.algorithmsHiddenUntilSubmit,
      dueAt: item.dueAt,
      href: `/groups/${item.groupId}/assignments/${item.id}`,
    }));

  return (
    <AppShell
      titleKey="shell.defaultTitle"
      subtitleKey="home.loggedInSubtitle"
      subtitleVars={{ nickname: me.nickname }}
    >
      <HomeClient
        me={me}
        loginApiBase={ENV.apiBaseUrl()}
        notifications={notifications}
        submissions={submissions}
        submissionCount={submissionCount}
        todoItems={todoItems}
        todoTotal={todoTotal}
      />
    </AppShell>
  );
}
