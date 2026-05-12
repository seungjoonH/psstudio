// 과제 서비스가 deadline reminder queue producer를 호출하는지 검증합니다.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dataSource } from "../../../config/data-source.js";
import { assertTestDatabaseUrl } from "../../../test/assert-test-database.js";
import { GroupsService } from "../../groups/groups.service.js";
import { User } from "../../users/user.entity.js";

const { syncDeadlineReminderJobsMock, removeDeadlineReminderJobsMock } = vi.hoisted(() => ({
  syncDeadlineReminderJobsMock: vi.fn(async () => undefined),
  removeDeadlineReminderJobsMock: vi.fn(async () => undefined),
}));

vi.mock("../../../shared/queues/deadline-reminder.queue.js", () => ({
  syncAssignmentDeadlineReminderJobs: syncDeadlineReminderJobsMock,
  removeAssignmentDeadlineReminderJobs: removeDeadlineReminderJobsMock,
}));

import { AssignmentsService } from "../assignments.service.js";

const groups = new GroupsService();
const assignments = new AssignmentsService();

async function makeUser(suffix: string): Promise<User> {
  const repo = dataSource.getRepository(User);
  return repo.save(
    repo.create({
      provider: "google",
      providerUserId: `adr-${suffix}`,
      email: `adr-${suffix}@example.com`,
      nickname: `리마인더-${suffix}`,
      profileImageUrl: "https://example.com/avatar.png",
    }),
  );
}

function testSuffix(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

beforeAll(async () => {
  assertTestDatabaseUrl(process.env.DATABASE_URL ?? "");
  if (!dataSource.isInitialized) await dataSource.initialize();
  await dataSource.runMigrations();
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  if (dataSource.isInitialized) await dataSource.destroy();
});

describe("AssignmentsService deadline reminder scheduling", () => {
  it("create는 새 과제의 deadline reminder job을 예약한다", async () => {
    const owner = await makeUser(testSuffix("owner-create"));
    const group = await groups.create(owner.id, { name: `리마인더 그룹 ${testSuffix("g")}` });
    const dueAt = new Date(Date.now() + 48 * 3600 * 1000);

    const assignment = await assignments.create(group.id, owner.id, {
      title: "리마인더 생성",
      problemUrl: "https://www.acmicpc.net/problem/1000",
      dueAt,
      allowLateSubmission: true,
    });

    expect(syncDeadlineReminderJobsMock).toHaveBeenCalledTimes(1);
    expect(syncDeadlineReminderJobsMock).toHaveBeenCalledWith(assignment.id, expect.any(Date));
    const calls = syncDeadlineReminderJobsMock.mock.calls as unknown[][];
    const scheduledDueAt = calls[0]?.[1];
    expect(scheduledDueAt).toBeInstanceOf(Date);
    if (!(scheduledDueAt instanceof Date)) {
      throw new Error("scheduledDueAt should be a Date");
    }
    expect(scheduledDueAt.toISOString()).toBe(dueAt.toISOString());
  });

  it("update는 마감 변경 시 deadline reminder job을 재예약한다", async () => {
    const owner = await makeUser(testSuffix("owner-update"));
    const group = await groups.create(owner.id, { name: `리마인더 수정 ${testSuffix("g")}` });
    const assignment = await assignments.create(group.id, owner.id, {
      title: "리마인더 수정",
      problemUrl: "https://www.acmicpc.net/problem/1001",
      dueAt: new Date(Date.now() + 24 * 3600 * 1000),
      allowLateSubmission: true,
    });
    vi.clearAllMocks();
    const nextDueAt = new Date(Date.now() + 72 * 3600 * 1000);

    await assignments.update(assignment.id, { dueAt: nextDueAt });

    expect(syncDeadlineReminderJobsMock).toHaveBeenCalledTimes(1);
    expect(syncDeadlineReminderJobsMock).toHaveBeenCalledWith(assignment.id, expect.any(Date));
    const calls = syncDeadlineReminderJobsMock.mock.calls as unknown[][];
    const scheduledDueAt = calls[0]?.[1];
    expect(scheduledDueAt).toBeInstanceOf(Date);
    if (!(scheduledDueAt instanceof Date)) {
      throw new Error("scheduledDueAt should be a Date");
    }
    expect(scheduledDueAt.toISOString()).toBe(nextDueAt.toISOString());
  });

  it("delete는 기존 deadline reminder job을 제거한다", async () => {
    const owner = await makeUser(testSuffix("owner-delete"));
    const group = await groups.create(owner.id, { name: `리마인더 삭제 ${testSuffix("g")}` });
    const assignment = await assignments.create(group.id, owner.id, {
      title: "리마인더 삭제",
      problemUrl: "https://www.acmicpc.net/problem/1002",
      dueAt: new Date(Date.now() + 24 * 3600 * 1000),
      allowLateSubmission: true,
    });
    vi.clearAllMocks();

    await assignments.delete(assignment.id, "리마인더 삭제");

    expect(removeDeadlineReminderJobsMock).toHaveBeenCalledTimes(1);
    expect(removeDeadlineReminderJobsMock).toHaveBeenCalledWith(assignment.id);
  });
});
