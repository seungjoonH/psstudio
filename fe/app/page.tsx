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

export default async function HomePage() {
  const me = await fetchMeServer();
  if (me === null) redirect("/login");
  const [notifications, submissions, groups] = await Promise.all([
    fetchRecentNotificationsServer(5),
    fetchRecentSubmissionsServer(5),
    listMyGroups(),
  ]);
  const assignmentChunks = await Promise.all(
    groups.map(async (group) => ({
      groupId: group.id,
      groupName: group.name,
      items: await listAssignments(group.id),
    })),
  );
  const todoItems = (
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
  )
    .filter((item) => !item.hasMySubmission)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 6)
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
        todoItems={todoItems}
      />
    </AppShell>
  );
}
