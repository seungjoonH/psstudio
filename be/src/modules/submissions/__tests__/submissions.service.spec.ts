// SubmissionsService DB 통합 테스트입니다.
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { dataSource } from "../../../config/data-source.js";
import { GroupsService } from "../../groups/groups.service.js";
import { AssignmentsService } from "../../assignments/assignments.service.js";
import { ReactionsService } from "../../reactions/reactions.service.js";
import { ReviewsService } from "../../reviews/reviews.service.js";
import { User } from "../../users/user.entity.js";
import { SubmissionsService } from "../submissions.service.js";
import { Submission } from "../submission.entity.js";
import { SubmissionVersion } from "../submission-version.entity.js";
import { assertTestDatabaseUrl } from "../../../test/assert-test-database.js";

const groups = new GroupsService();
const assignments = new AssignmentsService();
const reactions = new ReactionsService(groups);
const reviews = new ReviewsService(groups, reactions);
const submissions = new SubmissionsService(reactions, reviews);

async function makeUser(suffix: string): Promise<User> {
  const repo = dataSource.getRepository(User);
  return repo.save(
    repo.create({
      provider: "google",
      providerUserId: `sub-${suffix}`,
      email: `sub-${suffix}@example.com`,
      nickname: `제출-${suffix}`,
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
});

afterAll(async () => {
  if (dataSource.isInitialized) await dataSource.destroy();
});

async function setup() {
  const owner = await makeUser(testSuffix("owner"));
  const group = await groups.create(owner.id, { name: `제출 그룹 ${testSuffix("g")}` });
  const assignment = await assignments.create(group.id, owner.id, {
    title: "1번",
    problemUrl: "https://www.acmicpc.net/problem/1000",
    dueAt: new Date(Date.now() + 24 * 3600 * 1000),
    allowLateSubmission: true,
  });
  return { owner, group, assignment };
}

describe("SubmissionsService", () => {
  it("create는 버전 1을 함께 만든다", async () => {
    const { owner, assignment } = await setup();
    const s = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)",
    });
    const versions = await dataSource
      .getRepository(SubmissionVersion)
      .find({ where: { submissionId: s.id } });
    expect(versions.length).toBe(1);
    expect(versions[0].versionNo).toBe(1);
  });

  it("create는 제목이 없으면 작성자명 기준 기본 제목을 만든다", async () => {
    const { owner, assignment } = await setup();
    const first = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)",
    });
    const second = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(2)",
    });
    expect(first.title).toMatch(/^제출-owner-[a-z0-9]{8}의 풀이 #1$/);
    expect(second.title).toMatch(/^제출-owner-[a-z0-9]{8}의 풀이 #2$/);
  });

  it("updateCode는 새 버전 row를 추가한다", async () => {
    const { owner, assignment } = await setup();
    const s = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)",
    });
    const r = await submissions.updateCode(s.id, owner.id, {
      language: "python",
      code: "print(2)",
    });
    expect(r.newVersionNo).toBe(2);
    const updated = await dataSource.getRepository(Submission).findOneByOrFail({ id: s.id });
    expect(updated.currentVersionNo).toBe(2);
    expect(updated.latestCode).toBe("print(2)");
  });

  it("updateCode는 본인이 아니면 거부한다", async () => {
    const { owner, assignment } = await setup();
    const other = await makeUser(testSuffix("other"));
    const s = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)",
    });
    await expect(
      submissions.updateCode(s.id, other.id, { language: "python", code: "print(2)" }),
    ).rejects.toThrow();
  });

  it("updateCode는 언어 변경을 거부한다", async () => {
    const { owner, assignment } = await setup();
    const s = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)",
    });
    await expect(
      submissions.updateCode(s.id, owner.id, { language: "java", code: "x" }),
    ).rejects.toThrow();
  });

  it("create는 200KB를 초과하면 거부한다", async () => {
    const { owner, assignment } = await setup();
    const big = "a".repeat(200 * 1024 + 1);
    await expect(
      submissions.create(assignment.id, owner.id, { language: "python", code: big }),
    ).rejects.toThrow();
  });

  it("getDiff는 캐시를 사용한다", async () => {
    const { owner, assignment } = await setup();
    const s = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)\n",
    });
    await submissions.updateCode(s.id, owner.id, {
      language: "python",
      code: "print(2)\n",
    });
    const a = await submissions.getDiff(s.id, 1, 2);
    const b = await submissions.getDiff(s.id, 1, 2);
    expect(a.diffText).toContain("-print(1)");
    expect(b.diffText).toBe(a.diffText);
  });

  it("delete는 작성자가 아니면 거부한다", async () => {
    const { owner, assignment } = await setup();
    const stranger = await makeUser(testSuffix("stranger"));
    const s = await submissions.create(assignment.id, owner.id, {
      language: "python",
      code: "print(1)",
    });
    await expect(submissions.delete(s.id, stranger.id, false)).rejects.toThrow();
  });

  it("delete는 OWNER/MANAGER인 경우 다른 제출도 삭제할 수 있다", async () => {
    const { owner, assignment } = await setup();
    const author = await makeUser(testSuffix("author"));
    const s = await submissions.create(assignment.id, author.id, {
      language: "python",
      code: "print(1)",
    });
    await submissions.delete(s.id, owner.id, true);
    await expect(submissions.getDetail(s.id)).rejects.toThrow();
  });
});
