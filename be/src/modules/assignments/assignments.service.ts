// 과제와 문제 메타데이터를 관리하는 서비스입니다.
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NOTIFICATION_TYPES, type ProblemPlatform } from "@psstudio/shared";
import { type DataSource, IsNull, In } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { requestLlmChat } from "../ai/llm-chat-client.js";
import { CalendarEvent } from "../calendar/calendar-event.entity.js";
import { GroupMember } from "../groups/group-member.entity.js";
import { Comment } from "../comments/comment.entity.js";
import { Review } from "../reviews/review.entity.js";
import { ReviewReply } from "../reviews/review-reply.entity.js";
import { Notification } from "../notifications/notification.entity.js";
import { AiAnalysis } from "../submissions/ai-analysis.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { SubmissionDiff } from "../submissions/submission-diff.entity.js";
import { SubmissionVersion } from "../submissions/submission-version.entity.js";
import { User } from "../users/user.entity.js";
import { Assignment } from "./assignment.entity.js";
import { AssignmentPolicyOverride } from "./assignment-policy-override.entity.js";
import { ProblemAnalysis, type ProblemMetadata } from "./problem-analysis.entity.js";
import { extractOfficialProblemTitle } from "./problem-official-title.js";
import { parseProblemUrl } from "./problem-parser.js";

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type AssignmentDetail = {
  id: string;
  groupId: string;
  title: string;
  hintPlain: string;
  problemUrl: string;
  platform: ProblemPlatform;
  difficulty: string | null;
  dueAt: Date;
  allowLateSubmission: boolean;
  createdByUserId: string;
  createdAt: Date;
  metadata: ProblemMetadata;
  analysisStatus: string;
  isLate: boolean;
};

export type DeletionImpact = {
  submissionCount: number;
  reviewCount: number;
  commentCount: number;
};

export type AssignmentAutofill = {
  title: string;
  hint: string;
  algorithms: string[];
  difficulty: string;
};

const BOJ_TIER_WORD_TO_CODE: Record<string, string> = {
  bronze: "B",
  silver: "S",
  gold: "G",
  platinum: "P",
  diamond: "D",
  ruby: "R",
};

const ALGORITHM_KEYWORDS = [
  "구현",
  "자료구조",
  "완전탐색",
  "브루트포스",
  "그리디",
  "정렬",
  "해시",
  "문자열",
  "파싱",
  "수학",
  "기하",
  "정수론",
  "비트마스킹",
  "누적합",
  "차분배열",
  "투포인터",
  "슬라이딩윈도우",
  "이진탐색",
  "매개변수탐색",
  "분할정복",
  "백트래킹",
  "재귀",
  "BFS",
  "DFS",
  "그래프",
  "트리",
  "유니온파인드",
  "최단경로",
  "다익스트라",
  "플로이드워셜",
  "벨만포드",
  "위상정렬",
  "강한연결요소",
  "최소신장트리",
  "DP",
  "트리DP",
  "비트DP",
  "메모이제이션",
  "큐",
  "스택",
  "덱",
  "우선순위큐",
  "힙",
  "세그먼트트리",
  "펜윅트리",
  "희소배열",
  "트라이",
  "최대유량",
  "이분매칭",
  "네트워크플로우",
] as const;

function solvedAcLevelToBojCode(level: number): string {
  if (!Number.isInteger(level) || level < 1 || level > 30) return "";
  const tierCodes = ["B", "S", "G", "P", "D", "R"] as const;
  const tierIdx = Math.floor((level - 1) / 5);
  const rank = 5 - ((level - 1) % 5);
  return `${tierCodes[tierIdx]}${rank}`;
}

function normalizeDifficulty(platform: ProblemPlatform, rawDifficulty: string): string {
  const raw = rawDifficulty.trim();
  if (raw.length === 0) return "";

  if (platform === "BOJ") {
    const compact = raw.replace(/\s+/g, "").toUpperCase();
    const codeMatch = compact.match(/^([BSGPDR])([1-5])$/);
    if (codeMatch !== null) return `${codeMatch[1]}${codeMatch[2]}`;

    const wordMatch = raw.trim().match(/(bronze|silver|gold|platinum|diamond|ruby)\s*([1-5])/i);
    if (wordMatch !== null) {
      const tier = BOJ_TIER_WORD_TO_CODE[wordMatch[1].toLowerCase()];
      if (tier !== undefined) return `${tier}${wordMatch[2]}`;
    }
    return "";
  }

  if (platform === "Programmers") {
    const levelMatch = raw.match(/(?:^|\b)(?:lv\.?|level)\s*([0-5])(?:\b|$)/i);
    if (levelMatch !== null) return `Lv. ${levelMatch[1]}`;
    return "";
  }

  if (platform === "LeetCode") {
    const lower = raw.toLowerCase();
    if (lower.includes("easy")) return "Easy";
    if (lower.includes("medium")) return "Medium";
    if (lower.includes("hard")) return "Hard";
    return "";
  }

  return raw;
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "psstudio-autofill/1.0",
        Accept: "text/html,application/xhtml+xml,application/json",
      },
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function sanitizeAiInputText(input: string): string {
  return input
    .replace(/네트워크 연결 끊김/gi, " ")
    .replace(/네트워크가 불안정하여 서버와의 연결이 끊어졌습니다\./gi, " ")
    .replace(/페이지 새로고침을 하거나 네트워크가 안정적이 되면 자동으로 재 연결됩니다\./gi, " ")
    .replace(/네트워크가 정상임에도 계속해서 연결이 끊어진 상태가 지속된다면 네트워크 방화벽 문제일 수 있습니다\./gi, " ")
    .replace(/모바일 테더링 등 다른 네트워크를 통해 테스트에 접속해 보세요\./gi, " ")
    .replace(/로그인하기/gi, " ")
    .replace(/질문하기\s*\(\d+\)/gi, " ")
    .replace(/실행 결과가 여기에 표시됩니다\./gi, " ")
    .replace(/프로그래머스 K-Digital Training/gi, " ")
    .replace(/이 사이트의 기능을 모두 활용하기 위해서는 자바스크립트를 활성화할 필요가 있습니다\./gi, " ")
    .replace(/브라우저에서 자바스크립트를 활성화하는 방법 을 참고하세요\./gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sliceBetweenMarkers(source: string, startMarker: string, endMarkers: string[]): string {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const from = source.slice(start);
  let end = from.length;
  for (const marker of endMarkers) {
    const idx = from.indexOf(marker);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return from.slice(0, end).trim();
}

function buildAiProblemContexts(platform: ProblemPlatform, html: string): string[] {
  const plain = sanitizeAiInputText(htmlToPlainText(html));
  const contexts: string[] = [];

  if (platform === "Programmers") {
    const focused = sliceBetweenMarkers(plain, "문제 설명", [
      "질문하기",
      "로그인하기",
      "실행 결과",
      "프로그래머스 K-Digital Training",
    ]);
    if (focused.length > 0) contexts.push(focused);
  }

  if (plain.length > 0) contexts.push(plain);
  return Array.from(new Set(contexts)).map((ctx) => ctx.slice(0, 5000));
}

function hasProgrammersProblemSignature(html: string): boolean {
  const lower = html.toLowerCase();
  const hasLessonMeta =
    lower.includes("data-controller=\"lessons\"") &&
    lower.includes("class=\"lesson-content\"") &&
    lower.includes("data-lesson-id=") &&
    lower.includes("data-challenge-level=");
  const hasGuideOrRunSection =
    lower.includes("class=\"guide-section-description\"") ||
    lower.includes("class=\"challenge-content") ||
    lower.includes("class=\"run-section\"");
  const hasProblemHeading = lower.includes("문제 설명");
  return hasLessonMeta && hasGuideOrRunSection && hasProblemHeading;
}

function hasProblemContent(platform: ProblemPlatform, html: string): boolean {
  const lowerHtml = html.toLowerCase();
  if (platform === "Programmers" && hasProgrammersProblemSignature(html)) {
    return true;
  }

  const hasEditorSignal =
    lowerHtml.includes("class=\"code-editor\"") ||
    lowerHtml.includes("class='code-editor'") ||
    lowerHtml.includes("codehilite") ||
    lowerHtml.includes("rouge-code");
  if (hasEditorSignal) return true;

  const plain = htmlToPlainText(html).toLowerCase();
  return plain.includes("입력") && plain.includes("출력");
}

function getProgrammersDifficultyFromHtml(html: string): string {
  if (html.length === 0) return "";
  const levelMatch = html.match(/data-challenge-level="([0-5])"/i);
  if (levelMatch === null) return "";
  return `Lv. ${levelMatch[1]}`;
}

function getBojDifficultyFromHtml(html: string): string {
  if (html.length === 0) return "";

  const directCode = html.match(/\b([BSGPDR][1-5])\b/);
  if (directCode !== null) return directCode[1];

  const levelNumberMatch =
    html.match(/(?:data-problem-level|problem_level|tier)[^0-9]{0,10}([1-9]|[12][0-9]|30)/i) ??
    html.match(/\/(?:tier|level)[/_-](?:small[_-]?)?([1-9]|[12][0-9]|30)\.(?:svg|png)/i);
  if (levelNumberMatch !== null) {
    const level = Number(levelNumberMatch[1]);
    return solvedAcLevelToBojCode(level);
  }

  return "";
}

@Injectable()
export class AssignmentsService {
  private get ds(): DataSource {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  async list(groupId: string): Promise<AssignmentDetail[]> {
    await this.ensureInitialized();
    const items = await this.ds
      .getRepository(Assignment)
      .find({ where: { groupId, deletedAt: IsNull() }, order: { dueAt: "DESC" } });
    if (items.length === 0) return [];
    const analyses = await this.ds
      .getRepository(ProblemAnalysis)
      .find({ where: { assignmentId: In(items.map((i) => i.id)) } });
    const analysisMap = new Map(analyses.map((a) => [a.assignmentId, a]));
    const now = Date.now();
    return items.map((a) => {
      const an = analysisMap.get(a.id);
      return {
        id: a.id,
        groupId: a.groupId,
        title: a.title,
        hintPlain: a.hintPlain,
        problemUrl: a.problemUrl,
        platform: a.platform,
        difficulty: a.difficulty,
        dueAt: a.dueAt,
        allowLateSubmission: a.allowLateSubmission,
        createdByUserId: a.createdByUserId,
        createdAt: a.createdAt,
        metadata: an?.metadata ?? {},
        analysisStatus: an?.status ?? "NONE",
        isLate: a.dueAt.getTime() < now,
      };
    });
  }

  async getById(assignmentId: string): Promise<AssignmentDetail> {
    await this.ensureInitialized();
    const a = await this.ds
      .getRepository(Assignment)
      .findOne({ where: { id: assignmentId, deletedAt: IsNull() } });
    if (a === null) throw new NotFoundException("과제를 찾을 수 없습니다.");
    const an = await this.ds
      .getRepository(ProblemAnalysis)
      .findOne({ where: { assignmentId } });
    return {
      id: a.id,
      groupId: a.groupId,
      title: a.title,
      hintPlain: a.hintPlain,
      problemUrl: a.problemUrl,
      platform: a.platform,
      difficulty: a.difficulty,
      dueAt: a.dueAt,
      allowLateSubmission: a.allowLateSubmission,
      createdByUserId: a.createdByUserId,
      createdAt: a.createdAt,
      metadata: an?.metadata ?? {},
      analysisStatus: an?.status ?? "NONE",
      isLate: a.dueAt.getTime() < Date.now(),
    };
  }

  async create(
    groupId: string,
    creatorId: string,
    body: {
      title: string;
      hint?: string;
      problemUrl: string;
      dueAt: Date;
      allowLateSubmission: boolean;
    },
  ): Promise<Assignment> {
    await this.ensureInitialized();
    const parsed = parseProblemUrl(body.problemUrl);
    const assignment = await this.ds.transaction(async (tx) => {
      const repo = tx.getRepository(Assignment);
      const row = await repo.save(
        repo.create({
          groupId,
          title: body.title,
          hintPlain: body.hint ?? "",
          problemUrl: parsed.url,
          platform: parsed.platform,
          dueAt: body.dueAt,
          allowLateSubmission: body.allowLateSubmission,
          createdByUserId: creatorId,
        }),
      );
      const analysisRepo = tx.getRepository(ProblemAnalysis);
      await analysisRepo.save(
        analysisRepo.create({
          assignmentId: row.id,
          status: "PENDING",
          metadata: {
            title: parsed.inferredTitle ?? undefined,
            hintHiddenUntilSubmit: true,
            algorithmsHiddenUntilSubmit: true,
          } satisfies ProblemMetadata,
        }),
      );
      const calendarRepo = tx.getRepository(CalendarEvent);
      await calendarRepo.save(
        calendarRepo.create({
          groupId,
          assignmentId: row.id,
          eventDate: toDateOnly(row.dueAt),
          status: "SCHEDULED",
        }),
      );
      this.enqueueProblemAnalysis(row.id);
      return row;
    });
    await this.notifyGroupMembersNewAssignment(assignment, creatorId);
    return assignment;
  }

  /** 등록자를 제외한 그룹 활성 멤버에게 새 과제 알림을 넣습니다. */
  private async notifyGroupMembersNewAssignment(assignment: Assignment, creatorId: string): Promise<void> {
    await this.ensureInitialized();
    const members = await this.ds.getRepository(GroupMember).find({
      where: { groupId: assignment.groupId, leftAt: IsNull() },
    });
    const creator = await this.ds
      .getRepository(User)
      .findOne({ where: { id: creatorId }, withDeleted: true });
    const creatorNickname = creator?.nickname ?? "멤버";
    const notifRepo = this.ds.getRepository(Notification);
    for (const m of members) {
      if (m.userId === creatorId) continue;
      await notifRepo.save(
        notifRepo.create({
          recipientUserId: m.userId,
          type: NOTIFICATION_TYPES.ASSIGNMENT_CREATED,
          payload: {
            title: `${creatorNickname}님이 새 과제「${assignment.title}」를 등록했습니다.`,
            groupId: assignment.groupId,
            assignmentId: assignment.id,
            actorUserId: creatorId,
            actorNickname: creatorNickname,
            actorProfileImageUrl: creator?.profileImageUrl ?? "",
          },
        }),
      );
    }
  }

  async update(
    assignmentId: string,
    body: {
      title?: string;
      hint?: string;
      problemUrl?: string;
      dueAt?: Date;
      allowLateSubmission?: boolean;
    },
  ): Promise<Assignment> {
    await this.ensureInitialized();
    const repo = this.ds.getRepository(Assignment);
    const a = await repo.findOne({ where: { id: assignmentId, deletedAt: IsNull() } });
    if (a === null) throw new NotFoundException("과제를 찾을 수 없습니다.");
    let urlChanged = false;
    if (body.title !== undefined) a.title = body.title;
    if (body.hint !== undefined) a.hintPlain = body.hint;
    if (body.problemUrl !== undefined && body.problemUrl !== a.problemUrl) {
      const parsed = parseProblemUrl(body.problemUrl);
      a.problemUrl = parsed.url;
      a.platform = parsed.platform;
      urlChanged = true;
    }
    if (body.dueAt !== undefined) a.dueAt = body.dueAt;
    if (body.allowLateSubmission !== undefined) a.allowLateSubmission = body.allowLateSubmission;
    const saved = await repo.save(a);
    if (urlChanged) {
      await this.ds
        .getRepository(ProblemAnalysis)
        .update(
          { assignmentId: saved.id },
          {
            status: "PENDING",
            metadata: {
              hintHiddenUntilSubmit: true,
              algorithmsHiddenUntilSubmit: true,
            } satisfies ProblemMetadata,
          },
        );
      this.enqueueProblemAnalysis(saved.id);
    }
    if (body.dueAt !== undefined) {
      await this.ds
        .getRepository(CalendarEvent)
        .update({ assignmentId: saved.id }, { eventDate: toDateOnly(saved.dueAt) });
    }
    return saved;
  }

  async updateMetadata(
    assignmentId: string,
    metadata: Partial<ProblemMetadata> & { platform?: ProblemPlatform; difficulty?: string },
  ): Promise<void> {
    await this.ensureInitialized();
    const a = await this.getById(assignmentId);
    if (metadata.platform !== undefined || metadata.difficulty !== undefined) {
      const patch: Partial<Assignment> = {};
      if (metadata.platform !== undefined) patch.platform = metadata.platform;
      if (metadata.difficulty !== undefined) patch.difficulty = metadata.difficulty;
      await this.ds.getRepository(Assignment).update({ id: a.id }, patch);
    }
    const analysisRepo = this.ds.getRepository(ProblemAnalysis);
    const existing = await analysisRepo.findOne({ where: { assignmentId } });
    const merged: ProblemMetadata = {
      ...(existing?.metadata ?? {}),
      title: metadata.title ?? existing?.metadata.title,
      difficulty: metadata.difficulty ?? existing?.metadata.difficulty,
      algorithms: metadata.algorithms ?? existing?.metadata.algorithms,
      rawNotes: metadata.rawNotes ?? existing?.metadata.rawNotes,
      hintHiddenUntilSubmit:
        metadata.hintHiddenUntilSubmit ?? existing?.metadata.hintHiddenUntilSubmit ?? true,
      algorithmsHiddenUntilSubmit:
        metadata.algorithmsHiddenUntilSubmit ?? existing?.metadata.algorithmsHiddenUntilSubmit ?? true,
    };
    if (existing === null) {
      await analysisRepo.save(
        analysisRepo.create({ assignmentId, status: "DONE", metadata: merged, analyzedAt: new Date() }),
      );
      return;
    }
    existing.metadata = merged;
    existing.status = "DONE";
    existing.analyzedAt = new Date();
    await analysisRepo.save(existing);
  }

  async getDeletionImpact(assignmentId: string): Promise<DeletionImpact> {
    await this.ensureInitialized();
    const submissions = await this.ds
      .getRepository(Submission)
      .find({ where: { assignmentId }, select: ["id"] });
    const submissionIds = submissions.map((s) => s.id);
    let reviewCount = 0;
    let commentCount = 0;
    if (submissionIds.length > 0) {
      reviewCount = await this.ds
        .getRepository(Review)
        .count({ where: { submissionId: In(submissionIds) } });
      commentCount = await this.ds
        .getRepository(Comment)
        .count({ where: { submissionId: In(submissionIds) } });
    }
    const assignmentComments = await this.ds
      .getRepository(Comment)
      .count({ where: { assignmentId } });
    return {
      submissionCount: submissionIds.length,
      reviewCount,
      commentCount: commentCount + assignmentComments,
    };
  }

  async delete(assignmentId: string, confirmTitle: string): Promise<{ deleted: true }> {
    await this.ensureInitialized();
    const a = await this.getById(assignmentId);
    if (a.title !== confirmTitle) {
      throw new BadRequestException("과제명 확인이 일치하지 않습니다.");
    }
    return this.ds.transaction(async (tx) => {
      const submissionIds = (
        await tx.getRepository(Submission).find({ where: { assignmentId }, select: ["id"] })
      ).map((s) => s.id);
      const reviewIds =
        submissionIds.length === 0
          ? []
          : (
              await tx
                .getRepository(Review)
                .find({ where: { submissionId: In(submissionIds) }, select: ["id"] })
            ).map((r) => r.id);
      if (reviewIds.length > 0) {
        await tx.getRepository(ReviewReply).delete({ reviewId: In(reviewIds) });
        await tx.getRepository(Review).delete({ id: In(reviewIds) });
      }
      if (submissionIds.length > 0) {
        await tx.getRepository(AiAnalysis).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(SubmissionDiff).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(SubmissionVersion).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(Comment).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(Submission).delete({ id: In(submissionIds) });
      }
      await tx.getRepository(Comment).delete({ assignmentId });
      await tx.getRepository(CalendarEvent).delete({ assignmentId });
      await tx.getRepository(ProblemAnalysis).delete({ assignmentId });
      await tx.getRepository(AssignmentPolicyOverride).delete({ assignmentId });
      await tx.getRepository(Assignment).softDelete({ id: assignmentId });
      return { deleted: true } as const;
    });
  }

  enqueueProblemAnalysis(assignmentId: string): void {
    // 실제 LLM 호출은 Phase 10에서 워커가 처리하므로, 여기서는 표시만 한다.
    // eslint-disable-next-line no-console
    console.log(`[problem-analysis] enqueue assignmentId=${assignmentId}`);
  }

  async autofillFromAi(problemUrl: string): Promise<AssignmentAutofill> {
    const parsedUrl = parseProblemUrl(problemUrl);
    const problemHtml = await fetchText(parsedUrl.url);
    if (problemHtml.length === 0) {
      throw new BadRequestException("문제 페이지를 불러오지 못했습니다. URL을 확인해 주세요.");
    }
    if (!hasProblemContent(parsedUrl.platform, problemHtml)) {
      throw new BadRequestException(
        "문제 페이지에서 문제 본문(입력/출력 또는 코드 에디터)을 확인할 수 없어 AI 자동 채우기를 중단했습니다.",
      );
    }

    const model = ENV.llmModelAssignmentAutofill();
    const contexts = buildAiProblemContexts(parsedUrl.platform, problemHtml);
    if (contexts.length === 0) {
      throw new BadRequestException("문제 페이지 본문을 정제하지 못해 AI 자동 채우기를 중단했습니다.");
    }

    const requestAutofill = async (
      contextText: string,
    ): Promise<
      Partial<AssignmentAutofill> & {
        status?: string;
        reason?: string;
        description?: string;
        algorithmTags?: string[];
      }
    > => {
      let content = "";
      try {
        const result = await requestLlmChat({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "너는 알고리즘 과제 자동 입력 도우미다. 내용을 확인할 수 없으면 절대 추측하지 않는다. 반드시 JSON만 출력한다. 형식: {\"status\":\"ok|unavailable\",\"title\":\"...\",\"hint\":\"...\",\"algorithms\":[\"...\"],\"difficulty\":\"...\",\"reason\":\"...\"}. hint는 문제 원문 요약이 아니라 풀이 접근 힌트로 작성한다. algorithms는 반드시 1개 이상 반환한다. 과제 제목(title)은 Programmers·BOJ·LeetCode에서는 서버가 문제 페이지 HTML에서 공식 명칭을 추출하므로, 해당 플랫폼일 때는 title을 반드시 빈 문자열 \"\" 로 둔다. Other 플랫폼만 title에 한 줄 과제명을 적는다.",
            },
            {
              role: "user",
              content: `문제 URL: ${problemUrl}\n플랫폼: ${parsedUrl.platform}\n문제 페이지 본문(일부):\n${contextText}\n\n참고: 위 본문은 서버의 사전 검증을 통과한 문제 페이지 텍스트다. 네트워크 경고/로그인/실행 UI 문구가 섞여 있으면 무시하고 문제 본문만 근거로 판단해라.\n${
                parsedUrl.platform === "Other"
                  ? "한국어로 title(과제명 한 줄)·hint·algorithms를 채워라."
                  : "title 필드는 \"\" 로만 두어라(공식 문제명은 서버가 HTML에서 추출한다). hint·algorithms만 채워라."
              }\nhint는 "이 문제를 어떤 방식으로 풀면 되는지"를 안내하는 힌트여야 한다.\nalgorithms는 반드시 1개 이상 넣어라.\nalgorithms는 아래 목록 중에서만 고르고 정확히 같은 문자열로 반환해라.\n${ALGORITHM_KEYWORDS.join(", ")}\n난이도는 플랫폼 규칙에 맞춰 작성해.\n- BOJ: B1~R5\n- Programmers: Lv. 0~Lv. 5\n- LeetCode: Easy/Medium/Hard\n\n중요: 문제 본문이 사실상 비어 있는 경우에만 status를 unavailable로 반환하고, 그 외에는 status를 ok로 반환해라.`,
            },
          ],
        });
        content = result.content;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("_http_")) {
          throw new BadRequestException("AI 제공사 요청이 실패했습니다.");
        }
        throw error;
      }
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start < 0 || end < 0 || end <= start) {
        throw new BadRequestException("AI 응답 형식이 올바르지 않습니다.");
      }
      try {
        return JSON.parse(content.slice(start, end + 1)) as Partial<AssignmentAutofill> & {
          status?: string;
          reason?: string;
          description?: string;
          algorithmTags?: string[];
        };
      } catch {
        throw new BadRequestException("AI 응답 JSON을 해석할 수 없습니다.");
      }
    };

    let json:
      | (Partial<AssignmentAutofill> & {
          status?: string;
          reason?: string;
          description?: string;
          algorithmTags?: string[];
        })
      | null = null;
    for (const context of contexts) {
      const candidate = await requestAutofill(context);
      if (candidate.status !== "unavailable") {
        json = candidate;
        break;
      }
      json = candidate;
    }
    if (json === null || json.status === "unavailable") {
      const reason = String(json?.reason ?? "").trim();
      throw new BadRequestException(
        reason.length > 0
          ? `AI가 문제 내용을 확인할 수 없습니다: ${reason}`
          : "AI가 문제 내용을 확인할 수 없습니다.",
      );
    }

    const llmTitle = String(json.title ?? "").trim();
    const officialTitle = extractOfficialProblemTitle(parsedUrl.platform, problemHtml).trim();
    const title =
      officialTitle.length > 0
        ? officialTitle
        : llmTitle.length > 0
          ? llmTitle
          : "문제 풀이 과제";
    const hint = String((json.hint ?? json.description ?? "")).trim();
    const difficultyRaw = String((json as { difficulty?: string }).difficulty ?? "").trim();
    const algorithmsRaw = Array.isArray(json.algorithms)
      ? json.algorithms
      : Array.isArray(json.algorithmTags)
        ? json.algorithmTags
        : [];
    const algorithms = algorithmsRaw
      .map((t) => String(t).trim())
      .filter((t) => ALGORITHM_KEYWORDS.includes(t as (typeof ALGORITHM_KEYWORDS)[number]))
      .slice(0, 12);
    if (algorithms.length === 0) {
      throw new BadRequestException("AI 자동 채우기 결과에 알고리즘이 없어 중단했습니다.");
    }
    const uniqueAlgorithms = Array.from(new Set(algorithms));
    if (uniqueAlgorithms.length === 0) {
      throw new BadRequestException("AI 자동 채우기 결과에 알고리즘이 없어 중단했습니다.");
    }
    if (hint.length === 0) {
      throw new BadRequestException("AI 자동 채우기 결과에 힌트가 없어 중단했습니다.");
    }
    let difficulty = "";
    if (parsedUrl.platform === "Programmers") {
      difficulty = getProgrammersDifficultyFromHtml(problemHtml);
    } else if (parsedUrl.platform === "BOJ") {
      difficulty = getBojDifficultyFromHtml(problemHtml);
    } else {
      difficulty = normalizeDifficulty(parsedUrl.platform, difficultyRaw);
    }
    return {
      title,
      hint,
      algorithms: uniqueAlgorithms,
      difficulty,
    };
  }
}
