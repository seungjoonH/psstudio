// AssignmentsService DB 통합 테스트입니다.
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { In } from "typeorm";
import { dataSource } from "../../../config/data-source.js";
import { GroupsService } from "../../groups/groups.service.js";
import { GroupMember } from "../../groups/group-member.entity.js";
import { Notification } from "../../notifications/notification.entity.js";
import { User } from "../../users/user.entity.js";
import { AssignmentsService } from "../assignments.service.js";
import { AssignmentAssignee } from "../assignment-assignee.entity.js";
import { ProblemAnalysis } from "../problem-analysis.entity.js";
import { assertTestDatabaseUrl } from "../../../test/assert-test-database.js";

const groups = new GroupsService();
const assignments = new AssignmentsService();

async function makeUser(suffix: string): Promise<User> {
  const repo = dataSource.getRepository(User);
  return repo.save(
    repo.create({
      provider: "google",
      providerUserId: `as-${suffix}`,
      email: `as-${suffix}@example.com`,
      nickname: `과제-${suffix}`,
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

afterAll(async () => {
  if (dataSource.isInitialized) await dataSource.destroy();
});

describe("AssignmentsService", () => {
  it("create는 과제, 분석 PENDING, 캘린더 이벤트를 함께 생성한다", async () => {
    const owner = await makeUser(testSuffix("owner-create"));
    const group = await groups.create(owner.id, { name: `과제 그룹 ${testSuffix("g")}` });
    const a = await assignments.create(group.id, owner.id, {
      title: "1번 풀기",
      hint: "잘 풀자",
      problemUrl: "https://www.acmicpc.net/problem/1000",
      dueAt: new Date(Date.now() + 24 * 3600 * 1000),
      allowLateSubmission: true,
    });
    expect(a.platform).toBe("BOJ");
    const detail = await assignments.getById(a.id);
    expect(detail.analysisStatus).toBe("PENDING");
    expect(detail.metadata.title).toBe("백준 1000번");
    expect(detail.metadata.hintHiddenUntilSubmit).toBe(true);
    expect(detail.metadata.algorithmsHiddenUntilSubmit).toBe(true);
    expect(detail.assigneeUserIds).toEqual([owner.id]);
    expect(detail.isAssignedToMe).toBe(false);
  });

  it("update는 URL 변경 시 분석 상태를 PENDING으로 재설정한다", async () => {
    const owner = await makeUser(testSuffix("owner-update"));
    const group = await groups.create(owner.id, { name: `수정 그룹 ${testSuffix("g")}` });
    const a = await assignments.create(group.id, owner.id, {
      title: "초기",
      problemUrl: "https://www.acmicpc.net/problem/1000",
      dueAt: new Date(Date.now() + 1000),
      allowLateSubmission: true,
    });
    await dataSource
      .getRepository(ProblemAnalysis)
      .update({ assignmentId: a.id }, { status: "DONE", metadata: { title: "초기" } });
    await assignments.update(a.id, { problemUrl: "https://leetcode.com/problems/two-sum/" });
    const after = await assignments.getById(a.id);
    expect(after.platform).toBe("LeetCode");
    expect(after.analysisStatus).toBe("PENDING");
  });

  it("updateMetadata는 메타데이터를 머지하고 DONE으로 마킹한다", async () => {
    const owner = await makeUser(testSuffix("owner-meta"));
    const group = await groups.create(owner.id, { name: `메타 그룹 ${testSuffix("g")}` });
    const a = await assignments.create(group.id, owner.id, {
      title: "메타",
      problemUrl: "https://www.acmicpc.net/problem/1234",
      dueAt: new Date(Date.now() + 3600 * 1000),
      allowLateSubmission: true,
    });
    await assignments.updateMetadata(a.id, { difficulty: "Silver", algorithms: ["dp"] });
    const after = await assignments.getById(a.id);
    expect(after.difficulty).toBe("Silver");
    expect(after.metadata.algorithms).toEqual(["dp"]);
    expect(after.metadata.hintHiddenUntilSubmit).toBe(true);
    expect(after.metadata.algorithmsHiddenUntilSubmit).toBe(true);
    expect(after.analysisStatus).toBe("DONE");
  });

  it("delete는 confirmTitle 일치 시 소프트 삭제한다", async () => {
    const owner = await makeUser(testSuffix("owner-del"));
    const group = await groups.create(owner.id, { name: `삭제 그룹 ${testSuffix("g")}` });
    const a = await assignments.create(group.id, owner.id, {
      title: "지울 과제",
      problemUrl: "https://www.acmicpc.net/problem/2",
      dueAt: new Date(Date.now() + 3600 * 1000),
      allowLateSubmission: true,
    });
    const r = await assignments.delete(a.id, "지울 과제");
    expect(r.deleted).toBe(true);
    await expect(assignments.getById(a.id)).rejects.toThrow();
  });

  it("delete는 confirmTitle 불일치 시 거부한다", async () => {
    const owner = await makeUser(testSuffix("owner-bad"));
    const group = await groups.create(owner.id, { name: `잘못 그룹 ${testSuffix("g")}` });
    const a = await assignments.create(group.id, owner.id, {
      title: "정확",
      problemUrl: "https://www.acmicpc.net/problem/3",
      dueAt: new Date(Date.now() + 3600 * 1000),
      allowLateSubmission: true,
    });
    await expect(assignments.delete(a.id, "다름")).rejects.toThrow();
  });

  it("MANAGER는 생성 시 자기 자신이 assignee에 포함되어야 한다", async () => {
    const owner = await makeUser(testSuffix("owner-manager"));
    const manager = await makeUser(testSuffix("manager-create"));
    const group = await groups.create(owner.id, { name: `관리 그룹 ${testSuffix("g")}` });
    await dataSource.getRepository(GroupMember).save(
      dataSource.getRepository(GroupMember).create({
        groupId: group.id,
        userId: manager.id,
        role: "MANAGER",
      }),
    );

    await expect(
      assignments.create(
        group.id,
        manager.id,
        {
          title: "관리자 과제",
          problemUrl: "https://www.acmicpc.net/problem/10",
          dueAt: new Date(Date.now() + 3600 * 1000),
          allowLateSubmission: true,
          assigneeUserIds: [owner.id],
        },
        "MANAGER",
      ),
    ).rejects.toThrow();
  });

  it("update는 새로 추가된 assignee에게만 과제 등록 알림을 보낸다", async () => {
    const owner = await makeUser(testSuffix("owner-added"));
    const memberA = await makeUser(testSuffix("member-a"));
    const memberB = await makeUser(testSuffix("member-b"));
    const group = await groups.create(owner.id, { name: `추가알림 ${testSuffix("g")}` });
    const memberRepo = dataSource.getRepository(GroupMember);
    await memberRepo.save(
      memberRepo.create([
        { groupId: group.id, userId: memberA.id, role: "MEMBER" },
        { groupId: group.id, userId: memberB.id, role: "MEMBER" },
      ]),
    );
    const assignment = await assignments.create(group.id, owner.id, {
      title: "알림 과제",
      problemUrl: "https://www.acmicpc.net/problem/11",
      dueAt: new Date(Date.now() + 3600 * 1000),
      allowLateSubmission: true,
      assigneeUserIds: [owner.id, memberA.id],
    });
    await dataSource.getRepository(Notification).delete({
      recipientUserId: In([owner.id, memberA.id, memberB.id]),
      type: "ASSIGNMENT_CREATED",
    });

    await assignments.update(
      assignment.id,
      {
        assigneeUserIds: [owner.id, memberA.id, memberB.id],
      },
      owner.id,
      "OWNER",
    );

    const notifications = await dataSource.getRepository(Notification).find({
      where: {
        recipientUserId: In([owner.id, memberA.id, memberB.id]),
      },
      order: { createdAt: "ASC" },
    });
    expect(notifications.map((row) => row.recipientUserId)).toEqual([memberB.id]);
  });

  it("delete는 assignment_assignees도 함께 정리한다", async () => {
    const owner = await makeUser(testSuffix("owner-assignee-del"));
    const group = await groups.create(owner.id, { name: `대상삭제 ${testSuffix("g")}` });
    const assignment = await assignments.create(group.id, owner.id, {
      title: "assignee 삭제 과제",
      problemUrl: "https://www.acmicpc.net/problem/12",
      dueAt: new Date(Date.now() + 3600 * 1000),
      allowLateSubmission: true,
    });

    await assignments.delete(assignment.id, "assignee 삭제 과제");

    const rows = await dataSource.getRepository(AssignmentAssignee).find({
      where: { assignmentId: assignment.id },
      withDeleted: true,
    });
    expect(rows).toHaveLength(0);
  });
});
