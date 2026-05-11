// GroupsService DB 통합 테스트입니다.
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { dataSource } from "../../config/data-source.js";
import { Assignment } from "../assignments/assignment.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { Group } from "./group.entity.js";
import { GroupMember } from "./group-member.entity.js";
import { User } from "../users/user.entity.js";
import { GroupsService } from "./groups.service.js";
import { assertTestDatabaseUrl } from "../../test/assert-test-database.js";

const service = new GroupsService();

async function makeUser(provider: "google" | "github", suffix: string): Promise<User> {
  const repo = dataSource.getRepository(User);
  const user = repo.create({
    provider,
    providerUserId: `test-${suffix}`,
    email: `test-${suffix}@example.com`,
    nickname: `사용자-${suffix}`,
    profileImageUrl: "https://example.com/avatar.png",
  });
  return repo.save(user);
}

function testSuffix(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

beforeAll(async () => {
  assertTestDatabaseUrl(process.env.DATABASE_URL ?? "");
  if (!dataSource.isInitialized) await dataSource.initialize();
});

afterAll(async () => {
  if (dataSource.isInitialized) await dataSource.destroy();
});

describe("GroupsService", () => {
  it("create는 그룹과 OWNER 멤버를 함께 생성한다", async () => {
    const owner = await makeUser("google", testSuffix("owner-create"));
    const group = await service.create(owner.id, { name: `테스트 그룹 ${testSuffix("g")}` });
    expect(group.id).toBeDefined();
    const member = await service.getMembership(group.id, owner.id);
    expect(member?.role).toBe("OWNER");
  });

  it("transferOwnership은 권한과 OWNER ID를 교체한다", async () => {
    const owner = await makeUser("google", testSuffix("owner-tx"));
    const next = await makeUser("github", testSuffix("next-tx"));
    const group = await service.create(owner.id, { name: `위임 그룹 ${testSuffix("g")}` });
    await dataSource
      .getRepository(GroupMember)
      .save(dataSource.getRepository(GroupMember).create({ groupId: group.id, userId: next.id, role: "MEMBER" }));

    await service.transferOwnership(group.id, owner.id, next.id);

    const updated = await dataSource.getRepository(Group).findOneByOrFail({ id: group.id });
    expect(updated.ownerUserId).toBe(next.id);
    const ownerMember = await service.getMembership(group.id, owner.id);
    const nextMember = await service.getMembership(group.id, next.id);
    expect(ownerMember?.role).toBe("MANAGER");
    expect(nextMember?.role).toBe("OWNER");
  });

  it("OWNER는 leaveSelf를 사용할 수 없다", async () => {
    const owner = await makeUser("google", testSuffix("owner-leave"));
    const group = await service.create(owner.id, { name: `이탈 시도 ${testSuffix("g")}` });
    await expect(service.leaveSelf(group.id, owner.id)).rejects.toThrow();
  });

  it("deleteWithCascade는 그룹명 일치 시 소프트 삭제한다", async () => {
    const name = `삭제 그룹 ${testSuffix("g")}`;
    const owner = await makeUser("google", testSuffix("owner-del"));
    const group = await service.create(owner.id, { name });
    const result = await service.deleteWithCascade(group.id, name);
    expect(result.deleted).toBe(true);
    const got = await dataSource
      .getRepository(Group)
      .findOne({ where: { id: group.id }, withDeleted: true });
    expect(got?.deletedAt).not.toBeNull();
  });

  it("removeMember는 OWNER를 강퇴할 수 없다", async () => {
    const owner = await makeUser("google", testSuffix("owner-kick"));
    const group = await service.create(owner.id, { name: `보호 그룹 ${testSuffix("g")}` });
    await expect(service.removeMember(group.id, owner.id)).rejects.toThrow();
  });

  it("listMyGroups는 설명과 내 미제출 과제 수를 포함한다", async () => {
    const owner = await makeUser("google", testSuffix("owner-pend"));
    const group = await service.create(owner.id, {
      name: `펜딩 그룹 ${testSuffix("g")}`,
      description: "카드 설명 테스트",
    });
    const due = new Date(Date.now() + 86400000);
    const ar = dataSource.getRepository(Assignment);
    const a1 = await ar.save(
      ar.create({
        groupId: group.id,
        title: "과제1",
        problemUrl: "https://example.com/p1",
        platform: "BOJ",
        dueAt: due,
        createdByUserId: owner.id,
      }),
    );
    await ar.save(
      ar.create({
        groupId: group.id,
        title: "과제2",
        problemUrl: "https://example.com/p2",
        platform: "BOJ",
        dueAt: due,
        createdByUserId: owner.id,
      }),
    );

    const list = await service.listMyGroups(owner.id);
    const row = list.find((x) => x.id === group.id);
    expect(row?.description).toBe("카드 설명 테스트");
    expect(row?.myPendingAssignmentCount).toBe(2);

    const sr = dataSource.getRepository(Submission);
    await sr.save(
      sr.create({
        assignmentId: a1.id,
        authorUserId: owner.id,
        title: "제출",
        language: "cpp",
        latestCode: "int main(){}",
        isLate: false,
      }),
    );

    const list2 = await service.listMyGroups(owner.id);
    expect(list2.find((x) => x.id === group.id)?.myPendingAssignmentCount).toBe(1);
  });
});
