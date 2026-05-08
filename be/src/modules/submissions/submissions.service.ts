// 제출 CRUD/버전/diff를 관리하는 서비스입니다.
import {
  BadRequestException,
  Dependencies,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createPatch } from "diff";
import { jsonrepair } from "jsonrepair";
import { MAX_SUBMISSION_CODE_BYTES } from "@psstudio/shared";
import type { DataSource } from "typeorm";
import { In } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { Assignment } from "../assignments/assignment.entity.js";
import { Comment } from "../comments/comment.entity.js";
import { ReactionsService, type ReactionSummaryItem } from "../reactions/reactions.service.js";
import { Review } from "../reviews/review.entity.js";
import { ReviewReply } from "../reviews/review-reply.entity.js";
import { ReviewsService, type ReviewReplyItem } from "../reviews/reviews.service.js";
import { User } from "../users/user.entity.js";
import { AiAnalysis } from "./ai-analysis.entity.js";
import { Submission } from "./submission.entity.js";
import { SubmissionDiff } from "./submission-diff.entity.js";
import { SubmissionVersion } from "./submission-version.entity.js";

export type SubmissionListItem = {
  id: string;
  assignmentId: string;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  title: string;
  language: string;
  isLate: boolean;
  currentVersionNo: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SubmissionDetail = SubmissionListItem & {
  latestCode: string;
  noteMarkdown: string;
  versions: Array<{ versionNo: number; language: string; createdAt: Date }>;
};

export type SubmissionReviewItem = {
  id: string;
  versionNo: number;
  reviewType: "LINE" | "RANGE";
  startLine: number;
  endLine: number;
  body: string;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  createdAt: Date;
  reactions: ReactionSummaryItem[];
  replies: ReviewReplyItem[];
};

export type SubmissionCommentItem = {
  id: string;
  body: string;
  submissionVersionNo: number | null;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  createdAt: Date;
  reactions: ReactionSummaryItem[];
  replies: SubmissionCommentReplyItem[];
};

export type SubmissionCommentReplyItem = {
  id: string;
  body: string;
  submissionVersionNo: number | null;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  parentCommentId: string;
  createdAt: Date;
  reactions: ReactionSummaryItem[];
};

type ListFilters = {
  sort?: "createdAtAsc" | "createdAtDesc";
  authorId?: string;
  language?: string;
  isLate?: boolean;
};

type AiReviewLineComment = {
  startLine: number;
  endLine: number;
  anchorText: string | null;
  body: string;
};

type AiReviewPayload = {
  summary: string;
  lineComments: AiReviewLineComment[];
};

type AssignmentReviewContext = {
  title: string;
  problemUrl: string;
  platform: string;
  difficulty: string | null;
  hintPlain: string;
};

type ProblemPromptContext = {
  summary: string;
  input: string;
  output: string;
};

const REVIEW_FETCH_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function clip(text: string, max = 5000): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** 제출 언어 문자열을 마크다운 코드 펜스 언어 태그로 바꿉니다. */
function markdownFenceForSubmissionLanguage(language: string): string {
  const raw = language.trim().toLowerCase();
  if (raw.length === 0) return "text";
  const compact = raw.replace(/\s+/g, "");
  const map: Record<string, string> = {
    python: "python",
    py: "python",
    javascript: "javascript",
    js: "javascript",
    typescript: "typescript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    java: "java",
    kotlin: "kotlin",
    kt: "kotlin",
    scala: "scala",
    go: "go",
    golang: "go",
    rust: "rust",
    rs: "rust",
    cpp: "cpp",
    "c++": "cpp",
    cxx: "cpp",
    c: "c",
    csharp: "csharp",
    cs: "csharp",
    "c#": "csharp",
    ruby: "ruby",
    rb: "ruby",
    php: "php",
    swift: "swift",
    dart: "dart",
    r: "r",
    sql: "sql",
    shell: "bash",
    bash: "bash",
    sh: "bash",
    zsh: "bash",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    markdown: "markdown",
    md: "markdown",
    perl: "perl",
    lua: "lua",
    haskell: "haskell",
    hs: "haskell",
  };
  if (map[raw] !== undefined) return map[raw];
  if (map[compact] !== undefined) return map[compact];
  const safe = raw.replace(/[^a-z0-9+#-]/g, "");
  return safe.length > 0 ? safe : "text";
}

function validateAiLineCommentAgainstCode(
  lineComment: AiReviewLineComment,
  codeLines: string[],
): boolean {
  if (lineComment.startLine < 1 || lineComment.endLine < lineComment.startLine) return false;
  if (lineComment.endLine > codeLines.length) return false;
  const anchorText = lineComment.anchorText;
  if (typeof anchorText !== "string" || anchorText.length === 0) return true;
  const collapseWs = (s: string): string => s.replace(/\s+/g, " ").trim();
  const needle = collapseWs(anchorText);
  if (needle.length === 0) return true;
  const lineSlice = codeLines.slice(lineComment.startLine - 1, lineComment.endLine);
  if (lineSlice.some((line) => collapseWs(line).includes(needle))) return true;
  return codeLines.some((line) => collapseWs(line).includes(needle));
}

function isLowValueReviewSuggestion(body: string): boolean {
  const normalized = body.toLowerCase();
  const bannedHints = [
    "docstring",
    "jsdoc",
    "javadoc",
    "주석",
    "코멘트",
    "매개변수 설명",
    "파라미터 설명",
    "함수 설명",
    "설명이 있으면 좋",
    "설명을 추가",
    "주석을 추가",
  ];
  return bannedHints.some((hint) => normalized.includes(hint));
}

function hasImprovementSignal(text: string): boolean {
  const normalized = text.toLowerCase();
  const hints = [
    "개선",
    "보완",
    "여지",
    "필요",
    "권장",
    "추천",
    "문제",
    "주의",
    "리팩터",
    "최적화",
    "복잡도",
  ];
  return hints.some((hint) => normalized.includes(hint));
}

function isTooAbstractFeedback(body: string): boolean {
  const normalized = body.toLowerCase();
  const abstractHints = [
    "조금 더",
    "여지가 있",
    "명확하게 개선",
    "전반적으로",
    "좋지만",
  ];
  return abstractHints.some((hint) => normalized.includes(hint));
}

function hasStructuredImprovementFormat(body: string): boolean {
  const n = body.replace(/：/g, ":");
  return n.includes("문제:") && n.includes("근거:") && n.includes("개선:");
}

/** endLine이 코드 길이를 넘으면 잘라서 검증·앵커 매칭이 가능하게 한다. */
function clampLineCommentToCode(
  lineComment: AiReviewLineComment,
  codeLines: string[],
): AiReviewLineComment | null {
  const max = codeLines.length;
  if (max === 0 || lineComment.startLine < 1) return null;
  if (lineComment.startLine > max) return null;
  const startLine = lineComment.startLine;
  const endLine = Math.min(Math.max(lineComment.endLine, startLine), max);
  return { ...lineComment, startLine, endLine };
}

function detectTrivialSubmissionLineComment(codeLines: string[]): AiReviewLineComment | null {
  const meaningful = codeLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (meaningful.length === 0) return null;
  const hasCoreControlFlow = meaningful.some((line) =>
    /\b(def|class|for|while|if|return|switch|case|try|catch)\b/.test(line),
  );
  if (hasCoreControlFlow) return null;
  if (meaningful.length > 3) return null;
  const firstMeaningful = meaningful[0] ?? "";
  const startLine = Math.max(1, codeLines.findIndex((line) => line.trim().length > 0) + 1);
  return {
    startLine,
    endLine: startLine,
    anchorText: firstMeaningful.slice(0, 40),
    body: [
      "**문제:** 현재 제출은 문제를 해결하는 핵심 로직이 부족해 보입니다.",
      "",
      "**근거:** 실행·출력 중심의 짧은 코드만 있고, 입력 조건을 처리하는 분기·반복·검증 로직이 확인되지 않습니다.",
      "",
      "**개선:** 문제의 입력·제약을 기준으로 핵심 알고리즘을 구현하고, 경계값을 처리하는 로직까지 포함하면 좋습니다.",
    ].join("\n"),
  };
}

function buildAssignmentContextText(context: AssignmentReviewContext): string {
  return [
    `[문제 제목] ${context.title}`,
    `[문제 URL] ${context.problemUrl}`,
    `[플랫폼] ${context.platform}`,
    `[난이도] ${context.difficulty ?? "미기재"}`,
    `[힌트] ${context.hintPlain.trim().length > 0 ? clip(context.hintPlain, 300) : "없음"}`,
  ].join("\n");
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

function pickRandomUserAgent(): string {
  const idx = Math.floor(Math.random() * REVIEW_FETCH_USER_AGENTS.length);
  return REVIEW_FETCH_USER_AGENTS[idx] ?? REVIEW_FETCH_USER_AGENTS[0];
}

function sliceSectionByMarkers(source: string, startMarkers: string[], endMarkers: string[]): string {
  const foundStart = startMarkers
    .map((marker) => ({ marker, idx: source.indexOf(marker) }))
    .filter((item) => item.idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0];
  if (foundStart === undefined) return "";
  const from = source.slice(foundStart.idx + foundStart.marker.length).trim();
  if (from.length === 0) return "";
  let endIdx = from.length;
  for (const marker of endMarkers) {
    const idx = from.indexOf(marker);
    if (idx >= 0) endIdx = Math.min(endIdx, idx);
  }
  return clip(from.slice(0, endIdx).trim(), 1800);
}

const AI_REVIEW_JSON_PARSE_FAILURE_SUMMARY =
  "AI 리뷰 응답 형식을 해석하지 못했습니다. 잠시 후 AI 피드백을 다시 요청해 주세요.";

/** LLM 출력 앞뒤에 잡담이 붙었을 때 첫 번째 균형 잡힌 `{ ... }` 를 잘라냅니다. */
function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryJsonParseAiPayload(jsonStr: string): Partial<AiReviewPayload> | null {
  let data: unknown;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    try {
      data = JSON.parse(jsonrepair(jsonStr));
    } catch {
      return null;
    }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Partial<AiReviewPayload>;
}

/** 모델이 전체 JSON을 summary 문자열 안에 넣은 경우 펼칩니다. */
function unwrapEmbeddedPayloadInSummary(partial: Partial<AiReviewPayload>): Partial<AiReviewPayload> {
  if (Array.isArray(partial.lineComments) && partial.lineComments.length > 0) return partial;
  const s = partial.summary;
  if (typeof s !== "string") return partial;
  const t = s.trim();
  if (!t.startsWith("{")) return partial;
  const inner = tryJsonParseAiPayload(t);
  if (inner === null) return partial;
  if (typeof inner.summary !== "string" || inner.summary.trim().length === 0) return partial;
  return { ...partial, ...inner };
}

function tryParseAiReviewPayloadFromRaw(raw: string): Partial<AiReviewPayload> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const candidates: string[] = [];
  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced !== null) candidates.push(balanced);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced !== null) candidates.push(fenced[1].trim());
  candidates.push(trimmed);
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.length === 0 || seen.has(c)) continue;
    seen.add(c);
    const parsed = tryJsonParseAiPayload(c);
    if (parsed !== null) return unwrapEmbeddedPayloadInSummary(parsed);
  }
  return null;
}

function summaryLooksLikeRawApiEnvelope(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  if (!t.includes('"lineComments"')) return false;
  if (!t.includes('"summary"')) return false;
  return t.startsWith("{") || t.startsWith('{"');
}

function parseLineCommentsArray(commentsRaw: unknown): AiReviewLineComment[] {
  if (!Array.isArray(commentsRaw)) return [];
  return commentsRaw
    .map((item) => {
      const candidate = item as Partial<AiReviewLineComment>;
      const start = Number(candidate.startLine);
      const end = Number(candidate.endLine);
      const anchorText =
        typeof candidate.anchorText === "string" && candidate.anchorText.trim().length > 0
          ? candidate.anchorText.trim()
          : null;
      const body = typeof candidate.body === "string" ? candidate.body : "";
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
      if (body.trim().length === 0) return null;
      return { startLine: start, endLine: end, anchorText, body: clip(body) };
    })
    .filter((value): value is AiReviewLineComment => value !== null);
}

function parseAiReviewLineCommentsOnly(raw: string): AiReviewLineComment[] {
  const parsed = tryParseAiReviewPayloadFromRaw(raw);
  if (parsed === null) return [];
  return parseLineCommentsArray(parsed.lineComments);
}

export function parseAiReviewPayload(raw: string): AiReviewPayload {
  const parsed = tryParseAiReviewPayloadFromRaw(raw);
  if (parsed === null) {
    return { summary: AI_REVIEW_JSON_PARSE_FAILURE_SUMMARY, lineComments: [] };
  }
  let summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? clip(parsed.summary.trim())
      : "코드가 전반적으로 잘 작성되어 있습니다. 지금 상태를 유지해도 좋습니다.";
  const lineComments = parseLineCommentsArray(parsed.lineComments);

  if (summaryLooksLikeRawApiEnvelope(summary)) {
    const inner = tryParseAiReviewPayloadFromRaw(summary);
    const innerSummary =
      inner !== null &&
      typeof inner.summary === "string" &&
      inner.summary.trim().length > 0 &&
      !summaryLooksLikeRawApiEnvelope(inner.summary.trim())
        ? clip(inner.summary.trim())
        : null;
    const innerLineComments = inner !== null ? parseLineCommentsArray(inner.lineComments) : [];
    const salvagedComments = lineComments.length > 0 ? lineComments : innerLineComments;

    let nextSummary: string;
    if (innerSummary !== null) {
      nextSummary = innerSummary;
    } else if (salvagedComments.length > 0) {
      nextSummary =
        "요약을 자동으로 정리하지 못했습니다. 아래 라인 코멘트를 참고해 주세요.";
    } else {
      nextSummary = AI_REVIEW_JSON_PARSE_FAILURE_SUMMARY;
    }
    return { summary: nextSummary, lineComments: salvagedComments };
  }

  return { summary, lineComments };
}

@Injectable()
@Dependencies(ReactionsService, ReviewsService)
export class SubmissionsService {
  constructor(
    private readonly reactions: ReactionsService,
    private readonly reviews: ReviewsService,
  ) {}

  private get ds(): DataSource {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  async list(assignmentId: string, filters: ListFilters): Promise<SubmissionListItem[]> {
    await this.ensureInitialized();
    const qb = this.ds
      .getRepository(Submission)
      .createQueryBuilder("s")
      .where("s.assignment_id = :assignmentId", { assignmentId })
      .andWhere("s.deleted_at IS NULL");
    if (filters.authorId !== undefined) {
      qb.andWhere("s.author_user_id = :authorId", { authorId: filters.authorId });
    }
    if (filters.language !== undefined) {
      qb.andWhere("s.language = :language", { language: filters.language });
    }
    if (filters.isLate !== undefined) {
      qb.andWhere("s.is_late = :isLate", { isLate: filters.isLate });
    }
    qb.orderBy("s.created_at", filters.sort === "createdAtDesc" ? "DESC" : "ASC");
    const items = await qb.getMany();
    if (items.length === 0) return [];
    const users = await this.ds
      .getRepository(User)
      .findByIds(items.map((s) => s.authorUserId));
    const map = new Map(users.map((u) => [u.id, u]));
    return items.map((s) => {
      const u = map.get(s.authorUserId);
      return {
        id: s.id,
        assignmentId: s.assignmentId,
        authorUserId: s.authorUserId,
        authorNickname: u?.nickname ?? "탈퇴한 사용자",
        authorProfileImageUrl: u?.profileImageUrl ?? "",
        title: s.title,
        language: s.language,
        isLate: s.isLate,
        currentVersionNo: s.currentVersionNo,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });
  }

  async getDetail(submissionId: string): Promise<SubmissionDetail> {
    await this.ensureInitialized();
    const s = await this.ds
      .getRepository(Submission)
      .findOne({ where: { id: submissionId } });
    if (s === null || s.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    const versions = await this.ds
      .getRepository(SubmissionVersion)
      .find({ where: { submissionId }, order: { versionNo: "ASC" } });
    const u = await this.ds.getRepository(User).findOne({ where: { id: s.authorUserId }, withDeleted: true });
    return {
      id: s.id,
      assignmentId: s.assignmentId,
      authorUserId: s.authorUserId,
      authorNickname: u?.nickname ?? "탈퇴한 사용자",
      authorProfileImageUrl: u?.profileImageUrl ?? "",
      title: s.title,
      language: s.language,
      isLate: s.isLate,
      currentVersionNo: s.currentVersionNo,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      latestCode: s.latestCode,
      noteMarkdown: s.noteMarkdown,
      versions: versions.map((v) => ({
        versionNo: v.versionNo,
        language: v.language,
        createdAt: v.createdAt,
      })),
    };
  }

  async getVersionCode(submissionId: string, versionNo: number): Promise<{ language: string; code: string }> {
    await this.ensureInitialized();
    const v = await this.ds
      .getRepository(SubmissionVersion)
      .findOne({ where: { submissionId, versionNo } });
    if (v === null) throw new NotFoundException("버전을 찾을 수 없습니다.");
    return { language: v.language, code: v.code };
  }

  async create(
    assignmentId: string,
    authorId: string,
    body: { title?: string; language: string; code: string; noteMarkdown?: string },
  ): Promise<Submission> {
    await this.ensureInitialized();
    if (byteLength(body.code) > MAX_SUBMISSION_CODE_BYTES) {
      throw new BadRequestException("코드는 200KB를 초과할 수 없습니다.");
    }
    const a = await this.ds
      .getRepository(Assignment)
      .findOne({ where: { id: assignmentId } });
    if (a === null || a.deletedAt !== null) {
      throw new NotFoundException("과제를 찾을 수 없습니다.");
    }
    const isLate = a.dueAt.getTime() < Date.now();
    if (isLate && !a.allowLateSubmission) {
      throw new BadRequestException("이 과제는 지각 제출이 허용되지 않습니다.");
    }
    return this.ds.transaction(async (tx) => {
      const submissionRepo = tx.getRepository(Submission);
      const versionRepo = tx.getRepository(SubmissionVersion);
      const userRepo = tx.getRepository(User);
      const counter =
        (await submissionRepo
          .createQueryBuilder("s")
          .where("s.assignment_id = :assignmentId", { assignmentId })
          .andWhere("s.author_user_id = :authorId", { authorId })
          .andWhere("s.deleted_at IS NULL")
          .getCount()) + 1;
      const author = await userRepo.findOne({ where: { id: authorId }, withDeleted: true });
      const authorName = author?.nickname?.trim().length ? author.nickname.trim() : "사용자";
      const title = body.title?.trim().length
        ? body.title.trim()
        : `${authorName}의 풀이 #${counter}`;
      const submission = await submissionRepo.save(
        submissionRepo.create({
          assignmentId,
          authorUserId: authorId,
          title,
          language: body.language,
          latestCode: body.code,
          noteMarkdown: body.noteMarkdown?.trim() ?? "",
          isLate,
          currentVersionNo: 1,
        }),
      );
      await versionRepo.save(
        versionRepo.create({
          submissionId: submission.id,
          versionNo: 1,
          language: body.language,
          code: body.code,
        }),
      );
      this.enqueueSubmissionAnalysis(submission.id);
      return submission;
    });
  }

  async updateCode(
    submissionId: string,
    requesterId: string,
    body: { language: string; code: string },
  ): Promise<{ submissionId: string; newVersionNo: number }> {
    await this.ensureInitialized();
    if (byteLength(body.code) > MAX_SUBMISSION_CODE_BYTES) {
      throw new BadRequestException("코드는 200KB를 초과할 수 없습니다.");
    }
    return this.ds.transaction(async (tx) => {
      const s = await tx.getRepository(Submission).findOne({ where: { id: submissionId } });
      if (s === null || s.deletedAt !== null) {
        throw new NotFoundException("제출을 찾을 수 없습니다.");
      }
      if (s.authorUserId !== requesterId) {
        throw new ForbiddenException("본인 제출만 수정할 수 있습니다.");
      }
      if (body.language !== s.language) {
        throw new BadRequestException(
          "언어 변경은 같은 제출 안에서 할 수 없습니다. 새 제출을 만들어주세요.",
        );
      }
      const versionRepo = tx.getRepository(SubmissionVersion);
      const newVersionNo = s.currentVersionNo + 1;
      await versionRepo.save(
        versionRepo.create({
          submissionId,
          versionNo: newVersionNo,
          language: body.language,
          code: body.code,
        }),
      );
      s.currentVersionNo = newVersionNo;
      s.latestCode = body.code;
      s.language = body.language;
      await tx.getRepository(Submission).save(s);
      return { submissionId, newVersionNo };
    });
  }

  async rename(submissionId: string, requesterId: string, title: string): Promise<void> {
    await this.ensureInitialized();
    const s = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (s === null || s.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    if (s.authorUserId !== requesterId) {
      throw new ForbiddenException("본인 제출만 수정할 수 있습니다.");
    }
    s.title = title;
    await this.ds.getRepository(Submission).save(s);
  }

  async updateNoteMarkdown(submissionId: string, requesterId: string, noteMarkdown: string): Promise<void> {
    await this.ensureInitialized();
    const s = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (s === null || s.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    if (s.authorUserId !== requesterId) {
      throw new ForbiddenException("본인 제출만 수정할 수 있습니다.");
    }
    s.noteMarkdown = noteMarkdown.trim();
    await this.ds.getRepository(Submission).save(s);
  }

  async delete(submissionId: string, requesterId: string, isManager: boolean): Promise<void> {
    await this.ensureInitialized();
    const s = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (s === null || s.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    if (!isManager && s.authorUserId !== requesterId) {
      throw new ForbiddenException("본인 제출만 삭제할 수 있습니다.");
    }
    await this.ds.transaction(async (tx) => {
      const reviews = await tx
        .getRepository(Review)
        .find({ where: { submissionId }, select: ["id"] });
      const reviewIds = reviews.map((r) => r.id);
      if (reviewIds.length > 0) {
        const replies = await tx
          .getRepository(ReviewReply)
          .find({ where: { reviewId: In(reviewIds) }, select: ["id"] });
        const replyIds = replies.map((reply) => reply.id);
        if (replyIds.length > 0) {
          await this.reactions.deleteByTargets("review_reply", replyIds);
        }
        for (const id of reviewIds) {
          await tx.getRepository(ReviewReply).delete({ reviewId: id });
        }
        await this.reactions.deleteByTargets("review", reviewIds);
        await tx.getRepository(Review).delete({ submissionId });
      }
      const comments = await tx
        .getRepository(Comment)
        .find({ where: { submissionId }, select: ["id"] });
      const commentIds = comments.map((c) => c.id);
      if (commentIds.length > 0) {
        await this.reactions.deleteByTargets("comment", commentIds);
      }
      await tx.getRepository(Comment).delete({ submissionId });
      await tx.getRepository(AiAnalysis).delete({ submissionId });
      await tx.getRepository(SubmissionDiff).delete({ submissionId });
      await tx.getRepository(SubmissionVersion).delete({ submissionId });
      await tx.getRepository(Submission).softDelete({ id: submissionId });
    });
  }

  async getDiff(
    submissionId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<{ fromVersion: number; toVersion: number; diffText: string }> {
    await this.ensureInitialized();
    if (fromVersion < 0 || toVersion < 1) {
      throw new BadRequestException("비교 버전 번호가 올바르지 않습니다.");
    }
    if (fromVersion === toVersion) {
      throw new BadRequestException("같은 버전 사이의 diff는 의미가 없습니다.");
    }
    const cached = await this.ds
      .getRepository(SubmissionDiff)
      .findOne({ where: { submissionId, fromVersion, toVersion } });
    if (cached !== null) {
      return { fromVersion, toVersion, diffText: cached.diffText };
    }
    const submission = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (submission === null || submission.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    const toVersionRow = await this.ds
      .getRepository(SubmissionVersion)
      .findOne({ where: { submissionId, versionNo: toVersion } });
    const toCode =
      toVersionRow?.code ??
      (toVersion === submission.currentVersionNo ? submission.latestCode : null);
    if (toCode === null) {
      throw new NotFoundException("비교할 버전을 찾을 수 없습니다.");
    }
    const fromVersionRow =
      fromVersion === 0
        ? null
        : await this.ds
            .getRepository(SubmissionVersion)
            .findOne({ where: { submissionId, versionNo: fromVersion } });
    const fromCode =
      fromVersion === 0
        ? ""
        : fromVersionRow?.code ??
          (fromVersion === submission.currentVersionNo ? submission.latestCode : null);
    if (fromCode === null) {
      throw new NotFoundException("비교할 버전을 찾을 수 없습니다.");
    }
    const diffText = createPatch(`v${fromVersion}->v${toVersion}`, fromCode, toCode, "", "");
    await this.ds
      .getRepository(SubmissionDiff)
      .save(
        this.ds
          .getRepository(SubmissionDiff)
          .create({ submissionId, fromVersion, toVersion, diffText }),
      );
    return { fromVersion, toVersion, diffText };
  }

  async listReviews(
    submissionId: string,
    versionNo: number,
    viewerUserId: string,
  ): Promise<SubmissionReviewItem[]> {
    await this.ensureInitialized();
    const version = await this.ds
      .getRepository(SubmissionVersion)
      .findOne({ where: { submissionId, versionNo } });
    if (version === null) throw new NotFoundException("버전을 찾을 수 없습니다.");
    const reviews = await this.ds.getRepository(Review).find({
      where: { submissionId, submissionVersionId: version.id },
      order: { createdAt: "ASC" },
    });
    if (reviews.length === 0) return [];
    const userIds = [...new Set(reviews.map((review) => review.authorUserId))];
    const users = await this.ds.getRepository(User).find({
      where: { id: In(userIds) },
      withDeleted: true,
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const reviewIds = reviews.map((review) => review.id);
    const [reactionMap, replyMap] = await Promise.all([
      this.reactions.summarizeMany("review", reviewIds, viewerUserId),
      this.reviews.listRepliesForReviewIds(reviewIds, viewerUserId),
    ]);
    return reviews
      .filter((review) => review.startLine !== null && review.endLine !== null)
      .map((review) => ({
        id: review.id,
        versionNo,
        reviewType: review.reviewType === "RANGE" ? "RANGE" : "LINE",
        startLine: review.startLine as number,
        endLine: review.endLine as number,
        body: review.body,
        authorUserId: review.authorUserId,
        authorNickname: userMap.get(review.authorUserId)?.nickname ?? "탈퇴한 사용자",
        authorProfileImageUrl: userMap.get(review.authorUserId)?.profileImageUrl ?? "",
        createdAt: review.createdAt,
        reactions: reactionMap.get(review.id) ?? [],
        replies: replyMap.get(review.id) ?? [],
      }));
  }

  async createReview(
    submissionId: string,
    authorUserId: string,
    payload: { versionNo: number; startLine: number; endLine?: number; body: string },
  ): Promise<SubmissionReviewItem> {
    await this.ensureInitialized();
    const version = await this.ds
      .getRepository(SubmissionVersion)
      .findOne({ where: { submissionId, versionNo: payload.versionNo } });
    if (version === null) throw new NotFoundException("버전을 찾을 수 없습니다.");
    const submission = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (submission === null || submission.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    const endLine = payload.endLine ?? payload.startLine;
    const reviewType = endLine === payload.startLine ? "LINE" : "RANGE";
    const assignment = await this.ds.getRepository(Assignment).findOne({ where: { id: submission.assignmentId } });
    if (assignment === null || assignment.deletedAt !== null) {
      throw new NotFoundException("과제를 찾을 수 없습니다.");
    }
    const review = await this.ds.getRepository(Review).save(
      this.ds.getRepository(Review).create({
        groupId: assignment.groupId,
        assignmentId: submission.assignmentId,
        submissionId,
        submissionVersionId: version.id,
        authorUserId,
        reviewType,
        filePath: null,
        startLine: payload.startLine,
        endLine,
        body: payload.body.trim(),
      }),
    );
    const user = await this.ds.getRepository(User).findOne({ where: { id: authorUserId }, withDeleted: true });
    return {
      id: review.id,
      versionNo: payload.versionNo,
      reviewType,
      startLine: payload.startLine,
      endLine,
      body: review.body,
      authorUserId,
      authorNickname: user?.nickname ?? "탈퇴한 사용자",
      authorProfileImageUrl: user?.profileImageUrl ?? "",
      createdAt: review.createdAt,
      reactions: [],
      replies: [],
    };
  }

  async listComments(
    submissionId: string,
    viewerUserId: string,
  ): Promise<SubmissionCommentItem[]> {
    await this.ensureInitialized();
    const submission = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (submission === null || submission.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    const comments = await this.ds.getRepository(Comment).find({
      where: { submissionId },
      order: { createdAt: "ASC" },
    });
    if (comments.length === 0) return [];
    const userIds = [...new Set(comments.map((comment) => comment.authorUserId))];
    const users = await this.ds.getRepository(User).find({
      where: { id: In(userIds) },
      withDeleted: true,
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const commentIds = comments.map((comment) => comment.id);
    const reactionMap = await this.reactions.summarizeMany(
      "comment",
      commentIds,
      viewerUserId,
    );
    const repliesByParent = new Map<string, SubmissionCommentReplyItem[]>();
    for (const comment of comments) {
      if (comment.parentCommentId === null) continue;
      const list = repliesByParent.get(comment.parentCommentId) ?? [];
      list.push({
        id: comment.id,
        body: comment.isAdminHidden ? "삭제된 댓글입니다" : comment.body,
        submissionVersionNo: comment.submissionVersionNo,
        authorUserId: comment.authorUserId,
        authorNickname: userMap.get(comment.authorUserId)?.nickname ?? "탈퇴한 사용자",
        authorProfileImageUrl: userMap.get(comment.authorUserId)?.profileImageUrl ?? "",
        parentCommentId: comment.parentCommentId,
        createdAt: comment.createdAt,
        reactions: reactionMap.get(comment.id) ?? [],
      });
      repliesByParent.set(comment.parentCommentId, list);
    }
    return comments
      .filter((comment) => comment.parentCommentId === null)
      .map((comment) => ({
        id: comment.id,
        body: comment.isAdminHidden ? "삭제된 댓글입니다" : comment.body,
        submissionVersionNo: comment.submissionVersionNo,
        authorUserId: comment.authorUserId,
        authorNickname: userMap.get(comment.authorUserId)?.nickname ?? "탈퇴한 사용자",
        authorProfileImageUrl: userMap.get(comment.authorUserId)?.profileImageUrl ?? "",
        createdAt: comment.createdAt,
        reactions: reactionMap.get(comment.id) ?? [],
        replies: repliesByParent.get(comment.id) ?? [],
      }));
  }

  async createComment(
    submissionId: string,
    authorUserId: string,
    body: string,
    parentCommentId: string | null,
  ): Promise<SubmissionCommentItem | SubmissionCommentReplyItem> {
    await this.ensureInitialized();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException("댓글 내용을 입력해주세요.");
    }
    const submission = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (submission === null || submission.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    const assignment = await this.ds.getRepository(Assignment).findOne({ where: { id: submission.assignmentId } });
    if (assignment === null || assignment.deletedAt !== null) {
      throw new NotFoundException("과제를 찾을 수 없습니다.");
    }
    if (parentCommentId !== null) {
      const parent = await this.ds.getRepository(Comment).findOne({ where: { id: parentCommentId } });
      if (parent === null || parent.submissionId !== submissionId) {
        throw new NotFoundException("부모 댓글을 찾을 수 없습니다.");
      }
      if (parent.parentCommentId !== null) {
        throw new BadRequestException("답글의 답글은 지원하지 않습니다.");
      }
    }
    const comment = await this.ds.getRepository(Comment).save(
      this.ds.getRepository(Comment).create({
        groupId: assignment.groupId,
        assignmentId: submission.assignmentId,
        submissionId,
        submissionVersionNo: submission.currentVersionNo,
        parentCommentId,
        authorUserId,
        body: trimmed,
      }),
    );
    const user = await this.ds.getRepository(User).findOne({ where: { id: authorUserId }, withDeleted: true });
    if (parentCommentId === null) {
      return {
        id: comment.id,
        body: comment.body,
        submissionVersionNo: comment.submissionVersionNo,
        authorUserId,
        authorNickname: user?.nickname ?? "탈퇴한 사용자",
        authorProfileImageUrl: user?.profileImageUrl ?? "",
        createdAt: comment.createdAt,
        reactions: [],
        replies: [],
      };
    }
    return {
      id: comment.id,
      body: comment.body,
      submissionVersionNo: comment.submissionVersionNo,
      authorUserId,
      authorNickname: user?.nickname ?? "탈퇴한 사용자",
      authorProfileImageUrl: user?.profileImageUrl ?? "",
      parentCommentId,
      createdAt: comment.createdAt,
      reactions: [],
    };
  }

  enqueueSubmissionAnalysis(submissionId: string): void {
    // 실제 LLM 호출은 Phase 10에서 워커가 처리한다.
    // eslint-disable-next-line no-console
    console.log(`[submission-analysis] enqueue submissionId=${submissionId}`);
  }

  async requestAiReview(
    submissionId: string,
    requesterId: string,
    versionNo?: number,
  ): Promise<{ submissionId: string; versionNo: number }> {
    await this.ensureInitialized();
    const submission = await this.ds.getRepository(Submission).findOne({ where: { id: submissionId } });
    if (submission === null || submission.deletedAt !== null) {
      throw new NotFoundException("제출을 찾을 수 없습니다.");
    }
    const targetVersion = versionNo ?? submission.currentVersionNo;
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      throw new BadRequestException("잘못된 버전 번호입니다.");
    }
    const version = await this.ds
      .getRepository(SubmissionVersion)
      .findOne({ where: { submissionId, versionNo: targetVersion } });
    if (version === null) {
      throw new NotFoundException("버전을 찾을 수 없습니다.");
    }
    const assignment = await this.ds
      .getRepository(Assignment)
      .findOne({ where: { id: submission.assignmentId } });
    if (assignment === null || assignment.deletedAt !== null) {
      throw new NotFoundException("과제를 찾을 수 없습니다.");
    }
    const botUser = await this.ensureAiTutorUser();
    const problemPromptContext = await this.fetchProblemPromptContext(assignment.problemUrl);
    const assignmentContext: AssignmentReviewContext = {
      title: assignment.title,
      problemUrl: assignment.problemUrl,
      platform: assignment.platform,
      difficulty: assignment.difficulty,
      hintPlain: assignment.hintPlain,
    };
    const aiPayload = await this.generateAiReview(
      version.code,
      submission.noteMarkdown,
      assignmentContext,
      problemPromptContext,
      version.language,
    );
    const codeLines = version.code.split("\n");
    const pickValidLineComments = (comments: AiReviewLineComment[]): AiReviewLineComment[] =>
      comments
        .map((lineComment) => clampLineCommentToCode(lineComment, codeLines))
        .filter((lineComment): lineComment is AiReviewLineComment => lineComment !== null)
        .filter((lineComment) => validateAiLineCommentAgainstCode(lineComment, codeLines))
        .filter((lineComment) => !isLowValueReviewSuggestion(lineComment.body))
        .filter((lineComment) => !isTooAbstractFeedback(lineComment.body))
        .filter((lineComment) => hasStructuredImprovementFormat(lineComment.body));

    let validLineComments = pickValidLineComments(aiPayload.lineComments);
    let supplementAttempts = 0;
    while (
      validLineComments.length === 0 &&
      hasImprovementSignal(aiPayload.summary) &&
      supplementAttempts < 2
    ) {
      const extra = await this.requestLineCommentsSupplement(
        aiPayload.summary.trim(),
        version.code,
        submission.noteMarkdown,
        assignmentContext,
        problemPromptContext,
        version.language,
      );
      validLineComments = pickValidLineComments(extra);
      supplementAttempts += 1;
    }

    const fallbackTrivialComment = detectTrivialSubmissionLineComment(codeLines);
    const lineComments =
      validLineComments.length > 0
        ? validLineComments
        : fallbackTrivialComment !== null
          ? [fallbackTrivialComment]
          : [];

    await this.ds.transaction(async (tx) => {
      const summaryBody =
        aiPayload.summary.trim().length > 0
          ? aiPayload.summary.trim()
          : "리뷰 요약을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      await tx.getRepository(Comment).save(
        tx.getRepository(Comment).create({
          groupId: assignment.groupId,
          assignmentId: assignment.id,
          submissionId: submission.id,
          submissionVersionNo: targetVersion,
          parentCommentId: null,
          authorUserId: botUser.id,
          body: summaryBody,
        }),
      );
      for (const lineComment of lineComments) {
        await tx.getRepository(Review).save(
          tx.getRepository(Review).create({
            groupId: assignment.groupId,
            assignmentId: assignment.id,
            submissionId: submission.id,
            submissionVersionId: version.id,
            authorUserId: botUser.id,
            reviewType: lineComment.startLine === lineComment.endLine ? "LINE" : "RANGE",
            filePath: null,
            startLine: lineComment.startLine,
            endLine: lineComment.endLine,
            body: lineComment.body,
          }),
        );
      }
    });
    return { submissionId, versionNo: targetVersion };
  }

  private async ensureAiTutorUser(): Promise<User> {
    await this.ensureInitialized();
    const repo = this.ds.getRepository(User);
    const existing = await repo.findOne({
      where: { provider: "system", providerUserId: "ai-tutor" },
      withDeleted: true,
    });
    if (existing !== null) {
      if (existing.deletedAt !== null) {
        existing.deletedAt = null;
      }
      existing.isSystemBot = true;
      existing.nickname = "AI 튜터";
      existing.email = "ai-tutor@system.local";
      existing.profileImageUrl = "/icons/ai-tutor.svg";
      return repo.save(existing);
    }
    const created = repo.create({
      provider: "system",
      providerUserId: "ai-tutor",
      isSystemBot: true,
      email: "ai-tutor@system.local",
      nickname: "AI 튜터",
      profileImageUrl: "/icons/ai-tutor.svg",
    });
    return repo.save(created);
  }

  private async fetchProblemPromptContext(problemUrl: string): Promise<ProblemPromptContext | null> {
    try {
      const response = await fetch(problemUrl, {
        headers: {
          "User-Agent": pickRandomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const plain = htmlToPlainText(html);
      if (plain.length === 0) return null;
      return this.extractProblemPromptContext(plain);
    } catch {
      return null;
    }
  }

  private extractProblemPromptContext(plainText: string): ProblemPromptContext | null {
    const normalized = plainText.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) return null;
    const summaryCandidate = sliceSectionByMarkers(
      normalized,
      ["문제 설명", "문제", "Description", "Problem"],
      ["입력", "Input", "출력", "Output", "제한", "Constraints", "예제", "Examples"],
    );
    const inputCandidate = sliceSectionByMarkers(
      normalized,
      ["입력", "Input"],
      ["출력", "Output", "제한", "Constraints", "예제", "Examples"],
    );
    const outputCandidate = sliceSectionByMarkers(
      normalized,
      ["출력", "Output"],
      ["제한", "Constraints", "예제", "Examples"],
    );
    const summary = summaryCandidate.length > 0 ? summaryCandidate : clip(normalized, 1000);
    const input = inputCandidate.length > 0 ? inputCandidate : "추출 실패";
    const output = outputCandidate.length > 0 ? outputCandidate : "추출 실패";
    return { summary, input, output };
  }

  /** 요약에는 개선이 있는데 라인 코멘트가 비었을 때만 호출. 내용은 전부 LLM이 코드·문맥에서 생성한다. */
  private async requestLineCommentsSupplement(
    lockedSummary: string,
    code: string,
    noteMarkdown: string,
    context: AssignmentReviewContext,
    problemContext: ProblemPromptContext | null,
    codeLanguage: string,
  ): Promise<AiReviewLineComment[]> {
    const fenceLang = markdownFenceForSubmissionLanguage(codeLanguage);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.llmApiKey()}`,
      },
      body: JSON.stringify({
        model: ENV.llmModelSubmissionReview(),
        messages: [
          {
            role: "system",
            content: [
              "너는 앞 단계에서 이미 확정된 요약 리뷰에 대응하는 lineComments만 채우는 보완 단계다.",
              "반드시 JSON만 출력하고, JSON 외 설명문은 절대 출력하지 않는다.",
              '형식(이 키만): {"lineComments":[{"startLine":number,"endLine":number,"anchorText":string,"body":string}]}',
              "lineComments는 1개 이상 필수. summary 필드는 넣지 않는다.",
              "각 body는 반드시 문제·근거·개선 세 섹션을 포함한다. 라벨은 **문제:** / **근거:** / **개선:** 형식 권장, 섹션 사이는 빈 줄(\\n\\n)로 구분한다. 한 줄로 이어 붙이지 않는다.",
              "여러 줄 예시·수정 코드는 ```" +
                fenceLang +
                " 코드블록을 쓴다. JSON 문자열 안에서는 개행으로 블록을 나눈다.",
              "확정 요약 문장을 body 안에 길게 인용·복붙하지 말고, 실제 코드 줄에서 무엇이 어떻게 잘못될 수 있는지 구체적으로 써라.",
              "서로 다른 lineComments가 사실상 같은 결함·같은 수정이라면 하나로 합쳐라.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "[확정 요약 — 수정하지 말고, 이에 대응하는 라인 코멘트만 생성]",
              lockedSummary,
              "",
              "[문제 문맥]",
              buildAssignmentContextText(context),
              "[/문제 문맥]",
              "",
              "[문제 본문 핵심]",
              problemContext !== null
                ? [
                    `[요약] ${problemContext.summary}`,
                    `[입력] ${problemContext.input}`,
                    `[출력] ${problemContext.output}`,
                  ].join("\n")
                : "(문제 본문 추출 실패: URL 응답/파싱 실패)",
              "[/문제 본문 핵심]",
              "",
              "[메모]",
              noteMarkdown.trim().length > 0 ? noteMarkdown : "(메모 없음)",
              "[/메모]",
              "",
              "각 lineComments body는 Markdown으로 **문제:** / **근거:** / **개선:** 섹션을 빈 줄로 나누고, 필요하면 코드블록을 써서 가독성 있게 작성해줘.",
              "",
              `[제출 언어] ${codeLanguage.trim()} (마크다운 펜스: ${fenceLang})`,
              "",
              `\`\`\`${fenceLang}`,
              code,
              "```",
            ].join("\n"),
          },
        ],
        temperature: 0.15,
      }),
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    return parseAiReviewLineCommentsOnly(content);
  }

  private async requestAiReviewFromModel(
    code: string,
    noteMarkdown: string,
    context: AssignmentReviewContext,
    problemContext: ProblemPromptContext | null,
    codeLanguage: string,
    retryMode: boolean,
  ): Promise<AiReviewPayload> {
    const fenceLang = markdownFenceForSubmissionLanguage(codeLanguage);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.llmApiKey()}`,
      },
      body: JSON.stringify({
        model: ENV.llmModelSubmissionReview(),
        messages: [
          {
            role: "system",
            content: [
              "너는 실제 코드를 근거로만 리뷰하는 AI 코드 리뷰어다.",
              "반드시 **유효한 JSON 객체 한 개만** 출력한다. 앞뒤에 설명문·마크다운 제목·코드펜스(```)를 절대 붙이지 않는다.",
              "summary 값에는 요약 문장만 넣고, 전체 응답 JSON을 summary 문자열 안에 다시 넣지 않는다.",
              "형식:",
              "{\"summary\":string,\"lineComments\":[{\"startLine\":number,\"endLine\":number,\"anchorText\":string,\"body\":string}]}",
              "규칙:",
              "1) 실제 코드에서 근거를 찾을 수 있는 경우에만 리뷰를 남긴다. 근거가 약하면 생략한다.",
              "2) startLine/endLine은 1-based이며 여러 줄 범위 리뷰 가능. 범위가 겹쳐도 되지만, **실질적으로 다른 결함·다른 수정 방향**일 때만 별도 lineComments로 둔다. 같은 결함을 넓은 범위와 좁은 범위에 두 번 달지 않는다.",
              "3) anchorText는 지정한 라인 범위 안에 실제로 존재하는 부분 문자열이어야 한다.",
              "4) summary와 lineComments의 body는 한국어로 부드러운 제안형(~하면 좋습니다)을 쓴다. 둘 다 UI에서 Markdown(GFM)으로 렌더되므로 가독성을 최우선한다.",
              "5) 함수/변수/키워드·짧은 식은 `인라인 코드`로 감싼다. 2줄 이상의 예시·수정안은 반드시 fenced 코드블록으로 제시한다.",
              `6) fenced 코드블록은 반드시 \`\`\`${fenceLang} 로 시작한다. [제출 코드]와 같은 언어·문법이어야 하며 다른 언어 태그는 금지한다. JSON 문자열 안에서는 줄바꿈을 실제 개행(\\n)으로 넣어 문단·블록을 구분한다.`,
              "7) 주석/Docstring/JSDoc/매개변수 설명 추가 제안은 금지한다.",
              "8) '설명이 있으면 좋습니다' 같은 문서화 위주 피드백은 절대 쓰지 않는다.",
              "9) 리뷰는 반드시 다음 범주 중 하나에 해당해야 한다: 로직 오류 가능성, 더 나은 코드 표현/구조, 더 적합한 알고리즘, 시간·공간복잡도 개선.",
              "10) 특정 식별자 변경 제안 시 해당 식별자가 anchor 라인 범위에 실제로 있을 때만 제안한다.",
              "11) 매 실행마다 summary는 반드시 1개 작성한다. summary도 필요하면 빈 줄로 문단을 나누고, 항목이 여러 개면 `- ` 목록을 써도 된다.",
              "12) '코드가 잘 작성되었다'고 결론 내리기 전에, 경계값/반례를 아주 꼼꼼히 점검한다.",
              "13) 특히 숫자/시간 계산 로직은 반드시 경계값을 수동 시뮬레이션한다. 예: 50, 59, 60, 23시/24시 넘어감, > 와 >= 조건 차이.",
              "14) 루프/인덱스/요일 계산/오프바이원(+1, -1, %, 길이 기반 반복)을 반드시 샅샅이 검토한다.",
              "15) 오류 가능성이 조금이라도 보이면 긍정-only 응답을 금지하고, 해당 라인에 lineComments를 남긴다.",
              "16) 개선할 점이 없으면 summary는 긍정 코멘트만 1~2문장, lineComments는 빈 배열([]).",
              "17) 개선할 점이 있으면 summary는 긍정 + 개선 여지 언급 톤으로 1~2문장, 그리고 반드시 lineComments는 1개 이상(서로 다른 지적이 여러 개일 때만 2개 이상).",
              "18) lineComments body는 반드시 문제·근거·개선 세 섹션을 포함한다. 각 라벨은 줄 시작에 `**문제:**`, `**근거:**`, `**개선:**`처럼 쓰거나 동등하게 `문제:` 형태로 쓴다. 세 섹션 사이에는 반드시 빈 줄 한 줄(\\n\\n)을 넣어 한 줄 장문으로 붙이지 않는다.",
              "19) 추상 문구(예: '조금 더 명확하게', '개선 여지')만 있는 코멘트는 금지한다.",
              "20) 코드 주석 문구를 그대로 믿지 말고, 실제 코드 실행 의미를 우선으로 판단한다.",
              "21) 문제 문맥(제목/URL/힌트)과 무관한 템플릿 리뷰는 금지한다.",
              "22) 제출 코드가 문제 해결 로직 없이 출력/스텁 수준이면 반드시 개선 코멘트를 남긴다.",
              "23) lineComments는 최대 10개다.",
              "24) **중복 라인 코멘트 금지**: 두 개 이상의 lineComments가 같은 근거·같은 수정 제안(예: 동일한 경계값/`>` vs `>=`/같은 오프바이원)을 말하면 **하나로 합친다**. 대표적인 한 줄 또는 짧은 범위에만 단일 코멘트로 정리한다.",
              "25) lineComments가 2개 이상이면 각각이 **서로 다른 문제**(독립된 로직 오류, 다른 알고리즘 이슈, 별도의 복잡도 문제 등)인지 출력 전에 스스로 검증한다. 애매하면 개수를 줄인다.",
              "26) 가독성: 근거에 입력·중간값·기대값을 적을 때는 필요하면 `- ` 목록이나 짧은 표 형태(파이프 표)를 써도 된다. 핵심 조건·수식은 코드블록 또는 인라인 코드로 구분해 눈에 띄게 한다.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              retryMode
                ? "직전 응답이 규칙 위반이었습니다. 개선점이 있다면 lineComments를 1개 이상 채우고, 추상 표현 없이 구체적 근거를 적어주세요. 각 body는 Markdown으로 섹션마다 빈 줄을 넣고, 내용이 거의 같으면 하나로 합쳐 주세요."
                : "다음 코드를 문제 맥락을 고려해 리뷰해줘.",
              "실제로 피드백이 필요한 지점만 lineComments에 넣어줘.",
              "같은 버그·같은 수정 포인트를 여러 lineComments로 쪼개지 말고, 한 곳에만 명확히 달아줘.",
              "한 줄 리뷰만 고집하지 말고 필요하면 여러 줄 범위를 써줘.",
              "중요: 오류가 있는지 아주아주 꼼꼼히 샅샅이 점검하고, 경계값/반례를 먼저 검토한 뒤 결론을 내려줘.",
              "아래 문제 문맥을 반드시 참고해서, 코드가 문제를 실제로 해결하는지 먼저 판단해줘.",
              "",
              "[문제 문맥]",
              buildAssignmentContextText(context),
              "[/문제 문맥]",
              "",
              "[문제 본문 핵심]",
              problemContext !== null
                ? [
                    `[요약] ${problemContext.summary}`,
                    `[입력] ${problemContext.input}`,
                    `[출력] ${problemContext.output}`,
                  ].join("\n")
                : "(문제 본문 추출 실패: URL 응답/파싱 실패)",
              "[/문제 본문 핵심]",
              "아래 메모가 있으면 코드 의도/문맥 판단에 참고해줘.",
              "summary와 각 lineComments의 body는 Markdown으로 줄바꿈·문단 구분·코드블록을 적극 써서 읽기 쉽게 작성해줘.",
              "",
              "[메모]",
              noteMarkdown.trim().length > 0 ? noteMarkdown : "(메모 없음)",
              "[/메모]",
              "",
              `[제출 언어] ${codeLanguage.trim()} (마크다운 펜스: ${fenceLang})`,
              "",
              `\`\`\`${fenceLang}`,
              code,
              "```",
            ].join("\n"),
          },
        ],
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      throw new BadRequestException("AI 리뷰 요청에 실패했습니다.");
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    return parseAiReviewPayload(content);
  }

  private async generateAiReview(
    code: string,
    noteMarkdown: string,
    context: AssignmentReviewContext,
    problemContext: ProblemPromptContext | null,
    codeLanguage: string,
  ): Promise<AiReviewPayload> {
    const first = await this.requestAiReviewFromModel(
      code,
      noteMarkdown,
      context,
      problemContext,
      codeLanguage,
      false,
    );
    if (
      first.lineComments.some((line) => hasStructuredImprovementFormat(line.body)) ||
      !hasImprovementSignal(first.summary)
    ) {
      return first;
    }
    return this.requestAiReviewFromModel(code, noteMarkdown, context, problemContext, codeLanguage, true);
  }
}
