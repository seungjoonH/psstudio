// 과제와 문제 메타데이터를 관리하는 서비스입니다.
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NOTIFICATION_TYPES, type GroupRole, type ProblemPlatform } from "@psstudio/shared";
import { In, IsNull, type DataSource, type EntityManager } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { requestLlmChat } from "../ai/llm-chat-client.js";
import { CalendarEvent } from "../calendar/calendar-event.entity.js";
import { Group } from "../groups/group.entity.js";
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
import {
  removeAssignmentDeadlineReminderJobs,
  syncAssignmentDeadlineReminderJobs,
} from "../../shared/queues/deadline-reminder.queue.js";
import { Assignment } from "./assignment.entity.js";
import { AssignmentAssignee } from "./assignment-assignee.entity.js";
import { AssignmentPolicyOverride } from "./assignment-policy-override.entity.js";
import { ProblemAnalysis, type ProblemMetadata } from "./problem-analysis.entity.js";
import {
  fetchLeetCodeAutofillHtml,
  type LeetCodeQuestionPayload,
} from "./leetcode-question-fetch.js";
import { extractOfficialProblemTitle } from "./problem-official-title.js";
import { parseProblemUrl, type ParsedProblem } from "./problem-parser.js";

function toDateOnly(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
  assigneeUserIds: string[];
  assignees: AssignmentAssigneePreview[];
  isAssignedToMe: boolean;
};

export type AssignmentAssigneePreview = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
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
  "기타",
] as const;

const AUTOFILL_FETCH_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:125.0) Gecko/20100101 Firefox/125.0",
] as const;

type AutofillHintLocale = "ko" | "en";

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

function pickAutofillUserAgent(): string {
  const idx = Math.floor(Math.random() * AUTOFILL_FETCH_USER_AGENTS.length);
  return AUTOFILL_FETCH_USER_AGENTS[idx] ?? AUTOFILL_FETCH_USER_AGENTS[0];
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": pickAutofillUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

async function loadProblemHtmlForAutofill(parsed: ParsedProblem): Promise<string> {
  if (parsed.platform === "LeetCode" && parsed.externalId !== null) {
    return fetchLeetCodeAutofillHtml(parsed.externalId, parsed.url);
  }
  return fetchText(parsed.url);
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

function sliceUntilMarkers(source: string, endMarkers: string[]): string {
  let end = source.length;
  for (const marker of endMarkers) {
    const idx = source.indexOf(marker);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return source.slice(0, end).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractLeetCodeQuestionPayload(html: string): LeetCodeQuestionPayload | null {
  if (html.length === 0) return null;
  const nextDataMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch === null) return null;

  let nextData: unknown;
  try {
    nextData = JSON.parse(nextDataMatch[1]);
  } catch {
    return null;
  }

  const stack: unknown[] = [nextData];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!isRecord(current)) continue;

    const question = current.question;
    if (isRecord(question)) {
      const rawTitle =
        typeof question.translatedTitle === "string" && question.translatedTitle.trim().length > 0
          ? question.translatedTitle
          : typeof question.title === "string"
            ? question.title
            : "";
      const rawContent =
        typeof question.translatedContent === "string" && question.translatedContent.trim().length > 0
          ? question.translatedContent
          : typeof question.content === "string"
            ? question.content
            : "";
      const difficulty = typeof question.difficulty === "string" ? question.difficulty : "";
      const exampleTestcaseList = Array.isArray(question.exampleTestcaseList)
        ? question.exampleTestcaseList
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
        : [];
      const hasCodeSnippets = Array.isArray(question.codeSnippets) && question.codeSnippets.length > 0;
      if (rawTitle.trim().length > 0 && rawContent.trim().length > 0) {
        return {
          title: rawTitle.trim(),
          difficulty,
          contentHtml: rawContent,
          exampleTestcaseList,
          hasCodeSnippets,
        };
      }
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        for (const item of value) stack.push(item);
        continue;
      }
      stack.push(value);
    }
  }

  return null;
}

function buildLeetCodeAiContext(html: string): string {
  const payload = extractLeetCodeQuestionPayload(html);
  if (payload === null) return "";

  const plain = sanitizeAiInputText(htmlToPlainText(payload.contentHtml));
  if (plain.length === 0) return "";

  const problem = sliceUntilMarkers(plain, [
    "Example 1:",
    "Example 1",
    "Input:",
    "Input",
    "Constraints:",
    "Constraints",
    "Follow-up:",
    "Follow-up",
  ]);
  const input =
    sliceBetweenMarkers(plain, "Input:", [
      "Output:",
      "Explanation:",
      "Example 2:",
      "Example 2",
      "Constraints:",
      "Constraints",
      "Follow-up:",
      "Follow-up",
    ]) ||
    sliceBetweenMarkers(plain, "Input", [
      "Output",
      "Explanation",
      "Example 2",
      "Constraints",
      "Follow-up",
    ]) ||
    (payload.exampleTestcaseList[0] ?? "");
  const output =
    sliceBetweenMarkers(plain, "Output:", [
      "Explanation:",
      "Example 2:",
      "Example 2",
      "Constraints:",
      "Constraints",
      "Follow-up:",
      "Follow-up",
    ]) ||
    sliceBetweenMarkers(plain, "Output", [
      "Explanation",
      "Example 2",
      "Constraints",
      "Follow-up",
    ]);
  const constraints =
    sliceBetweenMarkers(plain, "Constraints:", ["Follow-up:", "Follow-up"]) ||
    sliceBetweenMarkers(plain, "Constraints", ["Follow-up", "Follow-up:"]);
  const difficulty = normalizeDifficulty("LeetCode", payload.difficulty);

  return [
    `제목: ${payload.title}`,
    difficulty.length > 0 ? `난이도: ${difficulty}` : "",
    problem.length > 0 ? `문제: ${problem}` : "",
    input.length > 0 ? `입력: ${input}` : "",
    output.length > 0 ? `출력: ${output}` : "",
    constraints.length > 0 ? `제한: ${constraints}` : "",
  ]
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();
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

  if (platform === "LeetCode") {
    const structured = buildLeetCodeAiContext(html);
    if (structured.length > 0) contexts.push(structured);
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
  if (platform === "LeetCode") {
    const payload = extractLeetCodeQuestionPayload(html);
    if (payload !== null) {
      return payload.contentHtml.trim().length > 0 || payload.hasCodeSnippets || payload.exampleTestcaseList.length > 0;
    }
  }

  const hasEditorSignal =
    lowerHtml.includes("class=\"code-editor\"") ||
    lowerHtml.includes("class='code-editor'") ||
    lowerHtml.includes("codehilite") ||
    lowerHtml.includes("rouge-code");
  if (hasEditorSignal) return true;

  const plain = htmlToPlainText(html).toLowerCase();
  return (plain.includes("입력") && plain.includes("출력")) || (plain.includes("input") && plain.includes("output"));
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

function getLeetCodeDifficultyFromHtml(html: string): string {
  const payload = extractLeetCodeQuestionPayload(html);
  if (payload === null) return "";
  return normalizeDifficulty("LeetCode", payload.difficulty);
}

function buildAutofillSystemPrompt(locale: AutofillHintLocale): string {
  if (locale === "en") {
    return [
      "You are an algorithm assignment autofill assistant.",
      "If the page content is not actually available, never guess.",
      'Return JSON only in this shape: {"status":"ok|unavailable","title":"...","hint":"...","algorithms":["..."],"difficulty":"...","reason":"..."}.',
      "The hint must be a solving approach hint, not a copy or summary of the original statement.",
      "algorithms must contain at least one item.",
      'For Programmers, BOJ, and LeetCode, the server extracts the official problem title from HTML, so title must be an empty string "".',
      "Only Other platform may fill title with a one-line assignment title.",
      "Write hint and reason in English.",
    ].join(" ");
  }

  return [
    "너는 알고리즘 과제 자동 입력 도우미다.",
    "내용을 확인할 수 없으면 절대 추측하지 않는다.",
    '반드시 JSON만 출력한다. 형식: {"status":"ok|unavailable","title":"...","hint":"...","algorithms":["..."],"difficulty":"...","reason":"..."}.',
    "hint는 문제 원문 요약이 아니라 풀이 접근 힌트로 작성한다.",
    "algorithms는 반드시 1개 이상 반환한다.",
    '과제 제목(title)은 Programmers·BOJ·LeetCode에서는 서버가 문제 페이지 HTML에서 공식 명칭을 추출하므로, 해당 플랫폼일 때는 title을 반드시 빈 문자열 "" 로 둔다.',
    "Other 플랫폼만 title에 한 줄 과제명을 적는다.",
    "hint와 reason은 반드시 한국어로 작성한다.",
  ].join(" ");
}

function buildAutofillUserPrompt(
  locale: AutofillHintLocale,
  problemUrl: string,
  platform: ProblemPlatform,
  contextText: string,
): string {
  if (locale === "en") {
    const titleRule =
      platform === "Other"
        ? "Write title as a one-line assignment title in English, and write hint in English. Keep algorithms as the allowed tokens."
        : 'Keep title as "" only because the server extracts the official problem title from HTML. Fill hint and algorithms only.';
    return [
      `Problem URL: ${problemUrl}`,
      `Platform: ${platform}`,
      `Problem page text excerpt:\n${contextText}`,
      "Note: the text above already passed the server-side problem-page validation.",
      "Ignore network warnings, login prompts, and execution UI noise if present, and rely only on the actual problem statement.",
      titleRule,
      "Write hint and reason in English.",
      'The hint must explain "how to approach solving this problem".',
      "algorithms must contain at least one item.",
      `algorithms must use only one or more of these exact tokens: ${ALGORITHM_KEYWORDS.join(", ")}.`,
      "Write difficulty in the platform format below.",
      "- BOJ: B1~R5",
      "- Programmers: Lv. 0~Lv. 5",
      "- LeetCode: Easy/Medium/Hard",
      'Important: return status as "unavailable" only when the actual problem content is effectively missing. Otherwise return status as "ok".',
    ].join("\n");
  }

  const titleRule =
    platform === "Other"
      ? "한국어로 title(과제명 한 줄)·hint·algorithms를 채워라."
      : 'title 필드는 "" 로만 두어라(공식 문제명은 서버가 HTML에서 추출한다). hint·algorithms만 채워라.';
  return [
    `문제 URL: ${problemUrl}`,
    `플랫폼: ${platform}`,
    `문제 페이지 본문(일부):\n${contextText}`,
    "참고: 위 본문은 서버의 사전 검증을 통과한 문제 페이지 텍스트다.",
    "네트워크 경고, 로그인 문구, 실행 UI 문구가 섞여 있으면 무시하고 문제 본문만 근거로 판단해라.",
    titleRule,
    "hint와 reason은 한국어로 작성해라.",
    'hint는 "이 문제를 어떤 방식으로 풀면 되는지"를 안내하는 힌트여야 한다.',
    "algorithms는 반드시 1개 이상 넣어라.",
    `algorithms는 아래 목록 중에서만 고르고 정확히 같은 문자열로 반환해라.\n${ALGORITHM_KEYWORDS.join(", ")}`,
    "난이도는 플랫폼 규칙에 맞춰 작성해.",
    "- BOJ: B1~R5",
    "- Programmers: Lv. 0~Lv. 5",
    "- LeetCode: Easy/Medium/Hard",
    '중요: 문제 본문이 사실상 비어 있는 경우에만 status를 unavailable로 반환하고, 그 외에는 status를 ok로 반환해라.',
  ].join("\n");
}

@Injectable()
export class AssignmentsService {
  private get ds(): DataSource {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  private async resolveAssigneeSnapshot(
    groupId: string,
    requestedUserIds: string[] | undefined,
    tx: EntityManager,
  ): Promise<string[]> {
    const activeMembers = await tx.getRepository(GroupMember).find({
      where: { groupId, leftAt: IsNull() },
      order: { joinedAt: "ASC" },
    });
    const activeUserIds = activeMembers.map((member: GroupMember) => member.userId);
    if (requestedUserIds === undefined) return activeUserIds;
    const uniqueUserIds = Array.from(new Set(requestedUserIds.map((value) => value.trim()).filter((value) => value.length > 0)));
    if (uniqueUserIds.length === 0) {
      throw new BadRequestException("대상자는 최소 1명이어야 합니다.");
    }
    const activeUserIdSet = new Set(activeUserIds);
    const invalidUserId = uniqueUserIds.find((userId) => !activeUserIdSet.has(userId));
    if (invalidUserId !== undefined) {
      throw new BadRequestException("현재 그룹 멤버만 대상자로 지정할 수 있습니다.");
    }
    return uniqueUserIds;
  }

  private ensureAssigneeActorConstraint(
    actorUserId: string,
    actorRole: GroupRole,
    assigneeUserIds: string[],
  ): void {
    if (assigneeUserIds.length === 0) {
      throw new BadRequestException("대상자는 최소 1명이어야 합니다.");
    }
    if (actorRole === "MANAGER" && !assigneeUserIds.includes(actorUserId)) {
      throw new BadRequestException("과제 대상자 구성이 올바르지 않습니다.");
    }
  }

  private async setAssigneeSnapshot(
    assignmentId: string,
    assigneeUserIds: string[],
    tx: EntityManager,
  ): Promise<void> {
    const assigneeRepo = tx.getRepository(AssignmentAssignee);
    await assigneeRepo.delete({ assignmentId });
    if (assigneeUserIds.length === 0) return;
    await assigneeRepo.save(
      assigneeRepo.create(
        assigneeUserIds.map((userId) => ({
          assignmentId,
          userId,
        })),
      ),
    );
  }

  private async notifyAssignmentCreatedRecipients(
    assignment: Assignment,
    recipientUserIds: string[],
  ): Promise<void> {
    const uniqueRecipientUserIds = Array.from(new Set(recipientUserIds));
    if (uniqueRecipientUserIds.length === 0) return;
    const group = await this.ds.getRepository(Group).findOne({ where: { id: assignment.groupId } });
    const groupName = (group?.name ?? "그룹").trim() || "그룹";
    const title = `${groupName} 그룹에서 "${assignment.title}" 과제가 등록되었습니다.`;
    const notifRepo = this.ds.getRepository(Notification);
    await notifRepo.save(
      notifRepo.create(
        uniqueRecipientUserIds.map((recipientUserId) => ({
          recipientUserId,
          type: NOTIFICATION_TYPES.ASSIGNMENT_CREATED,
          payload: {
            title,
            groupId: assignment.groupId,
            assignmentId: assignment.id,
          },
        })),
      ),
    );
  }

  private async buildAssignmentDetails(
    items: Assignment[],
    viewerUserId?: string,
  ): Promise<AssignmentDetail[]> {
    if (items.length === 0) return [];
    const assignmentIds = items.map((item) => item.id);
    const [analyses, assigneeRows] = await Promise.all([
      this.ds.getRepository(ProblemAnalysis).find({ where: { assignmentId: In(assignmentIds) } }),
      this.ds.getRepository(AssignmentAssignee).find({
        where: { assignmentId: In(assignmentIds) },
        order: { createdAt: "ASC" },
      }),
    ]);
    const assigneeUserIds = Array.from(new Set(assigneeRows.map((row: AssignmentAssignee) => row.userId)));
    const assigneeUsers =
      assigneeUserIds.length === 0
        ? []
        : await this.ds.getRepository(User).find({
            where: { id: In(assigneeUserIds) },
            select: ["id", "nickname", "profileImageUrl"],
            withDeleted: true,
          });
    const analysisMap = new Map<string, ProblemAnalysis>(
      analyses.map((analysis: ProblemAnalysis) => [analysis.assignmentId, analysis]),
    );
    const assigneeUserMap = new Map<string, Pick<User, "id" | "nickname" | "profileImageUrl">>(
      assigneeUsers.map((user: Pick<User, "id" | "nickname" | "profileImageUrl">) => [user.id, user]),
    );
    const assigneeMap = new Map<
      string,
      {
        assigneeUserIds: string[];
        assignees: AssignmentAssigneePreview[];
      }
    >();
    for (const row of assigneeRows) {
      const current = assigneeMap.get(row.assignmentId) ?? {
        assigneeUserIds: [],
        assignees: [],
      };
      current.assigneeUserIds.push(row.userId);
      const user = assigneeUserMap.get(row.userId);
      if (user !== undefined) {
        current.assignees.push({
          userId: user.id,
          nickname: user.nickname,
          profileImageUrl: user.profileImageUrl,
        });
      }
      assigneeMap.set(row.assignmentId, current);
    }
    const now = Date.now();
    return items.map((assignment) => {
      const analysis = analysisMap.get(assignment.id);
      const assignee = assigneeMap.get(assignment.id) ?? {
        assigneeUserIds: [],
        assignees: [],
      };
      return {
        id: assignment.id,
        groupId: assignment.groupId,
        title: assignment.title,
        hintPlain: assignment.hintPlain,
        problemUrl: assignment.problemUrl,
        platform: assignment.platform,
        difficulty: assignment.difficulty,
        dueAt: assignment.dueAt,
        allowLateSubmission: assignment.allowLateSubmission,
        createdByUserId: assignment.createdByUserId,
        createdAt: assignment.createdAt,
        metadata: analysis?.metadata ?? {},
        analysisStatus: analysis?.status ?? "NONE",
        isLate: assignment.dueAt.getTime() < now,
        assigneeUserIds: assignee.assigneeUserIds,
        assignees: assignee.assignees,
        isAssignedToMe:
          viewerUserId !== undefined ? assignee.assigneeUserIds.includes(viewerUserId) : false,
      };
    });
  }

  async list(groupId: string, viewerUserId?: string): Promise<AssignmentDetail[]> {
    await this.ensureInitialized();
    const items = await this.ds
      .getRepository(Assignment)
      .find({ where: { groupId, deletedAt: IsNull() }, order: { dueAt: "DESC" } });
    return this.buildAssignmentDetails(items, viewerUserId);
  }

  async getById(assignmentId: string, viewerUserId?: string): Promise<AssignmentDetail> {
    await this.ensureInitialized();
    const assignment = await this.ds
      .getRepository(Assignment)
      .findOne({ where: { id: assignmentId, deletedAt: IsNull() } });
    if (assignment === null) throw new NotFoundException("과제를 찾을 수 없습니다.");
    const [detail] = await this.buildAssignmentDetails([assignment], viewerUserId);
    return detail;
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
      assigneeUserIds?: string[];
    },
    actorRole: GroupRole = "OWNER",
  ): Promise<Assignment> {
    await this.ensureInitialized();
    const parsed = parseProblemUrl(body.problemUrl);
    let assigneeUserIds: string[] = [];
    const assignment = await this.ds.transaction(async (tx: EntityManager) => {
      assigneeUserIds = await this.resolveAssigneeSnapshot(groupId, body.assigneeUserIds, tx);
      this.ensureAssigneeActorConstraint(creatorId, actorRole, assigneeUserIds);
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
      await this.setAssigneeSnapshot(row.id, assigneeUserIds, tx);
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
    await this.notifyAssignmentCreatedRecipients(assignment, assigneeUserIds);
    await syncAssignmentDeadlineReminderJobs(assignment.id, assignment.dueAt);
    return assignment;
  }

  async update(
    assignmentId: string,
    body: {
      title?: string;
      hint?: string;
      problemUrl?: string;
      dueAt?: Date;
      allowLateSubmission?: boolean;
      assigneeUserIds?: string[];
    },
    actorUserId?: string,
    actorRole: GroupRole = "OWNER",
  ): Promise<Assignment> {
    await this.ensureInitialized();
    let addedAssigneeUserIds: string[] = [];
    const saved = await this.ds.transaction(async (tx: EntityManager) => {
      const repo = tx.getRepository(Assignment);
      const assignment = await repo.findOne({ where: { id: assignmentId, deletedAt: IsNull() } });
      if (assignment === null) throw new NotFoundException("과제를 찾을 수 없습니다.");
      let urlChanged = false;
      if (body.title !== undefined) assignment.title = body.title;
      if (body.hint !== undefined) assignment.hintPlain = body.hint;
      if (body.problemUrl !== undefined && body.problemUrl !== assignment.problemUrl) {
        const parsed = parseProblemUrl(body.problemUrl);
        assignment.problemUrl = parsed.url;
        assignment.platform = parsed.platform;
        urlChanged = true;
      }
      if (body.dueAt !== undefined) assignment.dueAt = body.dueAt;
      if (body.allowLateSubmission !== undefined) assignment.allowLateSubmission = body.allowLateSubmission;
      const saved = await repo.save(assignment);
      if (body.assigneeUserIds !== undefined) {
        const previousAssigneeRows = await tx.getRepository(AssignmentAssignee).find({
          where: { assignmentId: saved.id },
          select: ["userId"],
        });
        const previousAssigneeUserIdSet = new Set(previousAssigneeRows.map((row: AssignmentAssignee) => row.userId));
        const nextAssigneeUserIds = await this.resolveAssigneeSnapshot(saved.groupId, body.assigneeUserIds, tx);
        this.ensureAssigneeActorConstraint(
          actorUserId ?? saved.createdByUserId,
          actorRole,
          nextAssigneeUserIds,
        );
        addedAssigneeUserIds = nextAssigneeUserIds.filter((userId) => !previousAssigneeUserIdSet.has(userId));
        await this.setAssigneeSnapshot(saved.id, nextAssigneeUserIds, tx);
      }
      if (urlChanged) {
        await tx.getRepository(ProblemAnalysis).update(
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
        await tx
          .getRepository(CalendarEvent)
          .update({ assignmentId: saved.id }, { eventDate: toDateOnly(saved.dueAt) });
      }
      return saved;
    });
    if (addedAssigneeUserIds.length > 0) {
      await this.notifyAssignmentCreatedRecipients(saved, addedAssigneeUserIds);
    }
    if (body.dueAt !== undefined) {
      await syncAssignmentDeadlineReminderJobs(saved.id, saved.dueAt);
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
    const submissionIds = submissions.map((s: Submission) => s.id);
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
    const result = await this.ds.transaction(async (tx: EntityManager) => {
      const submissionIds = (
        await tx.getRepository(Submission).find({ where: { assignmentId }, select: ["id"] })
      ).map((s: Submission) => s.id);
      const reviewIds =
        submissionIds.length === 0
          ? []
          : (
              await tx
                .getRepository(Review)
                .find({ where: { submissionId: In(submissionIds) }, select: ["id"] })
            ).map((r: Review) => r.id);
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
      await tx.getRepository(AssignmentAssignee).delete({ assignmentId });
      await tx.getRepository(AssignmentPolicyOverride).delete({ assignmentId });
      await tx.getRepository(Assignment).softDelete({ id: assignmentId });
      return { deleted: true } as const;
    });
    await removeAssignmentDeadlineReminderJobs(assignmentId);
    return result;
  }

  enqueueProblemAnalysis(assignmentId: string): void {
    // 실제 LLM 호출은 Phase 10에서 워커가 처리하므로, 여기서는 표시만 한다.
    // eslint-disable-next-line no-console
    console.log(`[problem-analysis] enqueue assignmentId=${assignmentId}`);
  }

  async autofillFromAi(
    problemUrl: string,
    hintLocale: AutofillHintLocale = "ko",
  ): Promise<AssignmentAutofill> {
    const parsedUrl = parseProblemUrl(problemUrl);
    const problemHtml = await loadProblemHtmlForAutofill(parsedUrl);
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
              content: buildAutofillSystemPrompt(hintLocale),
            },
            {
              role: "user",
              content: buildAutofillUserPrompt(
                hintLocale,
                problemUrl,
                parsedUrl.platform,
                contextText,
              ),
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
    } else if (parsedUrl.platform === "LeetCode") {
      difficulty = getLeetCodeDifficultyFromHtml(problemHtml);
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
