// 제출 CRUD/버전/diff를 관리하는 서비스입니다.
import {
  BadRequestException,
  Dependencies,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createPatch } from "diff";
import { jsonrepair } from "jsonrepair";
import { MAX_SUBMISSION_CODE_BYTES, NOTIFICATION_TYPES } from "@psstudio/shared";
import type { DataSource } from "typeorm";
import { In } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { Assignment } from "../assignments/assignment.entity.js";
import {
  normalizeAnchorText,
  resolveLineRangeFromNormalizedAnchors,
} from "../assignments/cohort-analysis-bundle.js";
import { fetchProblemPromptFromUrl, type ProblemPromptContext } from "../assignments/problem-prompt-from-url.js";
import { requestLlmChat } from "../ai/llm-chat-client.js";
import { Comment } from "../comments/comment.entity.js";
import { Notification } from "../notifications/notification.entity.js";
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

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 범위 전체가 공백 줄이면 아래쪽 코드 줄을 우선해 한 줄로 스냅한다(LLM이 빈 줄에 달 때 UI 앵커가 어긋나는 문제 완화). */
export function snapLineCommentOffWhitespaceOnlyRange(
  lineComment: AiReviewLineComment,
  codeLines: string[],
): AiReviewLineComment {
  const max = codeLines.length;
  const { startLine, endLine } = lineComment;
  let allWs = true;
  for (let ln = startLine; ln <= endLine; ln++) {
    if (ln < 1 || ln > max) continue;
    if (codeLines[ln - 1].trim().length > 0) {
      allWs = false;
      break;
    }
  }
  if (!allWs) return lineComment;

  let target = -1;
  for (let ln = endLine + 1; ln <= max; ln++) {
    if (codeLines[ln - 1].trim().length > 0) {
      target = ln;
      break;
    }
  }
  if (target < 0) {
    for (let ln = startLine - 1; ln >= 1; ln--) {
      if (codeLines[ln - 1].trim().length > 0) {
        target = ln;
        break;
      }
    }
  }
  if (target < 0) return lineComment;
  return { ...lineComment, startLine: target, endLine: target };
}

/** anchorText가 지정 범위에 없고 파일 어딘가에는 있으면 그 줄로 스냅한다(줄 번호만 틀린 경우 보정). */
export function snapLineCommentRangeToAnchorMatch(
  lineComment: AiReviewLineComment,
  codeLines: string[],
): AiReviewLineComment {
  const anchorText = lineComment.anchorText;
  if (typeof anchorText !== "string" || anchorText.trim().length === 0) return lineComment;
  const needle = collapseWs(anchorText);
  if (needle.length === 0) return lineComment;

  const slice = codeLines.slice(lineComment.startLine - 1, lineComment.endLine);
  if (slice.some((line) => collapseWs(line).includes(needle))) return lineComment;

  for (let i = 0; i < codeLines.length; i++) {
    if (collapseWs(codeLines[i]).includes(needle)) {
      const ln = i + 1;
      return { ...lineComment, startLine: ln, endLine: ln };
    }
  }
  return lineComment;
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

/** LLM lineComments 원소(줄 번호 또는 집단 분석과 동일한 앵커 텍스트). */
type LlmAiReviewLineCommentRow = {
  body: string;
  startAnchorText: string | null;
  endAnchorText: string | null;
  startLine: number | null;
  endLine: number | null;
  anchorText: string | null;
};

function parseLineCommentsLlmArray(commentsRaw: unknown): LlmAiReviewLineCommentRow[] {
  if (!Array.isArray(commentsRaw)) return [];
  return commentsRaw
    .map((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
      const rec = item as Record<string, unknown>;
      const body = typeof rec.body === "string" ? clip(rec.body) : "";
      if (body.trim().length === 0) return null;

      const sar = rec.startAnchorText ?? rec.start_anchor_text;
      const ear = rec.endAnchorText ?? rec.end_anchor_text;
      const startAnchorText =
        typeof sar === "string" && sar.trim().length > 0 ? sar.trim() : null;
      const endAnchorText = typeof ear === "string" && ear.trim().length > 0 ? ear.trim() : null;

      const startRaw = Number(rec.startLine);
      const endRaw = Number(rec.endLine);
      const startLine =
        Number.isInteger(startRaw) && startRaw >= 1 ? startRaw : (null as number | null);
      const endLine = Number.isInteger(endRaw) && endRaw >= 1 ? endRaw : (null as number | null);

      const atr = rec.anchorText;
      const anchorText =
        typeof atr === "string" && atr.trim().length > 0 ? atr.trim() : null;

      const hasAnchors = startAnchorText !== null || endAnchorText !== null;
      const hasLines =
        startLine !== null && endLine !== null && endLine >= startLine;
      if (!hasAnchors && !hasLines) return null;

      return {
        body,
        startAnchorText,
        endAnchorText,
        startLine,
        endLine,
        anchorText,
      };
    })
    .filter((v): v is LlmAiReviewLineCommentRow => v !== null);
}

function pickSnippetAnchorFromRange(codeLines: string[], startLine: number, endLine: number): string | null {
  for (let ln = startLine; ln <= endLine; ln++) {
    const line = codeLines[ln - 1];
    if (line !== undefined && line.trim().length > 0) {
      const t = line.trim();
      return t.length <= 160 ? t : `${t.slice(0, 157)}...`;
    }
  }
  return null;
}

function materializeAiReviewLineComments(
  codeLines: string[],
  rows: LlmAiReviewLineCommentRow[],
): AiReviewLineComment[] {
  const out: AiReviewLineComment[] = [];
  for (const row of rows) {
    const sNorm = row.startAnchorText !== null ? normalizeAnchorText(row.startAnchorText) : null;
    const eNorm = row.endAnchorText !== null ? normalizeAnchorText(row.endAnchorText) : null;
    if (sNorm !== null || eNorm !== null) {
      const resolved = resolveLineRangeFromNormalizedAnchors(codeLines, sNorm, eNorm);
      if (resolved === null) continue;
      let { startLine, endLine } = resolved;
      if (startLine > endLine) {
        const t = startLine;
        startLine = endLine;
        endLine = t;
      }
      out.push({
        startLine,
        endLine,
        anchorText: pickSnippetAnchorFromRange(codeLines, startLine, endLine),
        body: row.body,
      });
      continue;
    }
    if (row.startLine !== null && row.endLine !== null && row.endLine >= row.startLine) {
      out.push({
        startLine: row.startLine,
        endLine: row.endLine,
        anchorText: row.anchorText,
        body: row.body,
      });
    }
  }
  return out;
}

/** 단위 테스트 등 코드 원문 없이 파싱만 할 때(앵커만 있는 항목은 버린다). */
function materializeAiReviewLineCommentsWithoutCode(rows: LlmAiReviewLineCommentRow[]): AiReviewLineComment[] {
  return rows
    .filter(
      (r): r is LlmAiReviewLineCommentRow & { startLine: number; endLine: number } =>
        r.startLine !== null && r.endLine !== null && r.endLine >= r.startLine,
    )
    .map((r) => ({
      startLine: r.startLine,
      endLine: r.endLine,
      anchorText: r.anchorText,
      body: r.body,
    }));
}

function lineCommentsFromParsedPayload(
  parsed: Partial<AiReviewPayload>,
  submissionCode: string | undefined,
): AiReviewLineComment[] {
  const rows = parseLineCommentsLlmArray(parsed.lineComments);
  const codeLines =
    submissionCode !== undefined && submissionCode.length > 0 ? submissionCode.split("\n") : null;
  if (codeLines !== null) return materializeAiReviewLineComments(codeLines, rows);
  return materializeAiReviewLineCommentsWithoutCode(rows);
}

export function parseAiReviewPayload(raw: string, submissionCode?: string): AiReviewPayload {
  const parsed = tryParseAiReviewPayloadFromRaw(raw);
  if (parsed === null) {
    return { summary: AI_REVIEW_JSON_PARSE_FAILURE_SUMMARY, lineComments: [] };
  }
  let summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? clip(parsed.summary.trim())
      : "코드가 전반적으로 잘 작성되어 있습니다. 지금 상태를 유지해도 좋습니다.";
  const lineComments = lineCommentsFromParsedPayload(parsed, submissionCode);

  if (summaryLooksLikeRawApiEnvelope(summary)) {
    const inner = tryParseAiReviewPayloadFromRaw(summary);
    const innerSummary =
      inner !== null &&
      typeof inner.summary === "string" &&
      inner.summary.trim().length > 0 &&
      !summaryLooksLikeRawApiEnvelope(inner.summary.trim())
        ? clip(inner.summary.trim())
        : null;
    const innerLineComments = inner !== null ? lineCommentsFromParsedPayload(inner, submissionCode) : [];
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
  private readonly logger = new Logger(SubmissionsService.name);

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
    let parentComment: Comment | null = null;
    if (parentCommentId !== null) {
      parentComment = await this.ds.getRepository(Comment).findOne({ where: { id: parentCommentId } });
      if (parentComment === null || parentComment.submissionId !== submissionId) {
        throw new NotFoundException("부모 댓글을 찾을 수 없습니다.");
      }
      if (parentComment.parentCommentId !== null) {
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
    const authorNickname = user?.nickname ?? "탈퇴한 사용자";
    const notifRepo = this.ds.getRepository(Notification);
    if (parentCommentId === null) {
      if (submission.authorUserId !== authorUserId) {
        await notifRepo.save(
          notifRepo.create({
            recipientUserId: submission.authorUserId,
            type: NOTIFICATION_TYPES.COMMENT_ON_MY_SUBMISSION,
            payload: {
              title: `${authorNickname}님이 내 제출에 댓글을 남겼습니다.`,
              submissionId,
              assignmentId: submission.assignmentId,
              groupId: assignment.groupId,
              commentId: comment.id,
            },
          }),
        );
      }
    } else if (parentComment !== null && parentComment.authorUserId !== authorUserId) {
      await notifRepo.save(
        notifRepo.create({
          recipientUserId: parentComment.authorUserId,
          type: NOTIFICATION_TYPES.REPLY_ON_MY_COMMENT,
          payload: {
            title: `${authorNickname}님이 내 댓글에 답글을 남겼습니다.`,
            submissionId,
            assignmentId: submission.assignmentId,
            groupId: assignment.groupId,
            commentId: comment.id,
            parentCommentId,
          },
        }),
      );
    }

    if (parentCommentId === null) {
      return {
        id: comment.id,
        body: comment.body,
        submissionVersionNo: comment.submissionVersionNo,
        authorUserId,
        authorNickname,
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
      authorNickname,
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
    const problemPromptContext = await fetchProblemPromptFromUrl(assignment.problemUrl);
    const assignmentContext: AssignmentReviewContext = {
      title: assignment.title,
      problemUrl: assignment.problemUrl,
      platform: assignment.platform,
      difficulty: assignment.difficulty,
      hintPlain: assignment.hintPlain,
    };
    const aiPayload = await this.requestAiReviewFromModel(
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
        .map((lineComment) => snapLineCommentOffWhitespaceOnlyRange(lineComment, codeLines))
        .map((lineComment) => snapLineCommentRangeToAnchorMatch(lineComment, codeLines));

    const validLineComments = pickValidLineComments(aiPayload.lineComments);

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

  private async requestAiReviewFromModel(
    code: string,
    noteMarkdown: string,
    context: AssignmentReviewContext,
    problemContext: ProblemPromptContext | null,
    codeLanguage: string,
  ): Promise<AiReviewPayload> {
    const fenceLang = markdownFenceForSubmissionLanguage(codeLanguage);
    try {
      const response = await requestLlmChat({
        model: ENV.llmModelSubmissionReview(),
        temperature: 0.2,
        maxTokens: 4096,
        messages: [
          {
            role: "system",
            content: [
              "너는 실제 실행 결과를 기준으로 검증하는 AI 코드 리뷰어다.",
              "**가장 중요한 목표:** (1) 존재하지 않는 버그(False Positive)를 만들지 않는 것, 동시에 (2) 실제 버그를 실행 기반으로 검출하는 것. 둘 다 중요하지만, 충돌 시 (1)이 (2)보다 우선한다.",
              "리뷰 기준은 **오직 같은 메시지 안의 [문제 문맥]·[문제 본문 핵심]**이다. 다른 문제의 관행·정석·스타일 선호를 기준으로 판단하지 않는다.",
              "",
              "── 출력 형식 ──",
              "반드시 **유효한 JSON 객체 한 개만** 출력한다. 앞뒤에 설명문·마크다운 제목·코드펜스(```) 금지.",
              "{\"summary\":string,\"lineComments\":[{\"body\":string,\"startAnchorText\":string,\"endAnchorText\":string}]}",
              "lineComments 각 원소는 **body**(한국어 피드백)와, 집단 코드 AI 비교 분석과 동일하게 **startAnchorText** / **endAnchorText**만 쓴다.",
              "**startLine/endLine/anchorText 필드는 출력하지 않는다.** 서버가 제출 원문에서 앵커 문자열로 줄 번호를 찾아 붙인다.",
              "startAnchorText는 결함이 있는 구간의 **첫 물리 줄 전체**(또는 연속 여 줄을 그대로) 제출 코드에서 복사한다. 한 구간만 지적하면 endAnchorText는 생략 가능(그 경우 start 구간만으로 범위가 정해진다).",
              "endAnchorText를 쓸 때는 구간 **마지막 물리 줄 전체**를 제출 코드에서 그대로 복사한다. 앵커는 공백·들여쓰기까지 원문과 일치해야 서버가 같은 방식으로 줄을 찾을 수 있다.",
              "summary 값에는 요약 문장만 넣는다. summary 안에 응답 JSON을 다시 넣지 않는다.",
              "",
              "── summary vs lineComments (UI 계약, 위반 금지) ──",
              "앱은 summary를 **전역 댓글 한 줄**로만 보여 주고, **구체적 결함 설명은 lineComments만** 코드 옆에 붙인다.",
              "따라서 **줄·분기·호출 단위로 설명 가능한 결함**(예: 특정 `if` 이후 `getBlock`이 호출되지 않음, 루프 한 바퀴에서 `push`가 두 번 됨)은 **반드시 lineComments에만** 쓴다. 그런 내용을 summary에 길게 쓰면 **잘못된 출력**이다.",
              "lineComments가 1개 이상이면 summary는 **한 문장 이하**로만 쓴다. 허용 예: \"검증된 사항은 아래 라인 코멘트를 참고하면 됩니다.\" / \"아래에 검증된 피드백을 모았습니다.\" **금지:** summary에 함수명·줄 번호·원인·반례·수정안을 서술하는 것.",
              "",
              "── 리뷰 원칙 ──",
              "- 실제 결함이 검증된 경우에만 lineComments를 작성한다.",
              "- 검증되지 않은 추측·스타일 선호·취향 리뷰는 금지한다.",
              "- **오답 출력은 맞게 짚었더라도**, 원인 코드 지목이 틀렸거나 수정안이 반례를 해결하지 못하거나 정상 동작을 깨면 그 lineComment는 두지 않는다(잘못된 원인·수정은 False Positive에 준한다).",
              "- 결함이 없으면 lineComments는 빈 배열(`[]`)이어도 된다. **결함 0개는 정상 결과**다.",
              "- '뭐라도 지적해야 한다'는 압박을 의식적으로 거부한다.",
              "",
              "── 결함으로 인정되는 경우 (이 4가지에만 한정) ──",
              "1) [문제 명세] 기준 잘못된 출력이 발생한다 (반례 존재).",
              "2) 시간·공간복잡도가 명확히 악화된다 (정량 비교 가능).",
              "3) 자료구조 사용 오류로 정확성이 깨진다.",
              "4) 불필요한 중복 계산이 명확히 존재한다 (측정 가능한 제거).",
              "그 외(변수명, 코드 스타일, 함수 분리, early return 취향, 선언 방식, stream/filter/reduce 선호, '더 깔끔한 표현', 자료구조 취향, 삼항 vs if/else 등)는 결함이 아니다.",
              "",
              "── 가장 중요한 규칙: 실제 실행 추적 ──",
              "결함을 주장하기 전 반드시 **실제 입력으로 코드를 끝까지 실행 추적**한다. 다음 패턴은 특히 실제 상태 변화를 단계별로 계산한다: `push`/`append`, `+=`, 누적합, mutation, 루프 내부 상태 변경, special-case guard, `break`/`return`/`continue`.",
              "예) 배열에 값을 넣는 코드라면 (i) 각 반복에서 몇 번 호출되는지, (ii) 최종 배열 길이가 얼마인지, (iii) 실제 반환값이 무엇인지를 단계별로 계산한다.",
              "**'특수 케이스 처리처럼 보인다'는 추측만으로 정상 처리라고 판단하지 않는다.** 가드절(`if (x === c) ...`)이 정상 패턴인지 진짜 누락인지는 실제 실행 추적으로만 결정한다.",
              "**'이후 반복에서 덮어씌워진다'·'뒤에서 다시 계산된다'·'다음 루프에서 값이 바뀐다' 같은 주장도 실제 실행 경로(`break`/`return`/`continue`/도달 가능 인덱스)를 검증한 뒤에만 쓴다.**",
              "제출 코드 내부의 보조 함수·헬퍼는 정의를 따라가 반환값을 단계 시뮬레이션으로 확정한 뒤 결함 주장에 사용한다. 동작을 추측만 한 채 호출부만 보고 출력 오류를 단정하지 않는다.",
              "",
              "── 원인 분석 검증 (매우 중요) ──",
              "실제 오답이 발생했다는 사실만으로, 현재 지적한 코드 조각이 원인이라고 단정하지 않는다.",
              "결함을 설명할 때는 반드시: (1) 어떤 코드가 실제로 오답을 유발했는지, (2) 해당 코드만 수정하면 반례가 해결되는지, (3) 제안한 수정안이 기존 정상 동작을 깨지 않는지를 함께 검증한다.",
              "증상이 **보조 함수 내부**에만 두드러져도, **호출부의 인덱스·전달 인자·루프 경계**가 명세와 맞는지와 **함수 정의의 로직**을 동등한 후보로 두고 반례로 좁힌다. 한쪽만 길게 비난하고 다른 쪽의 독립 결함을 놓치지 않는다.",
              "특히 다음은 금지한다: 실제 원인과 무관한 `break`/`return`/루프 구조를 원인으로 지목하는 것, \"루프 전체를 돌아야 한다\" 같은 일반론적 수정 제안, 단순히 익숙한 구현 방식으로 바꾸는 제안.",
              "오답은 맞게 찾았더라도, 원인 분석 또는 수정 방향이 실제 코드 동작과 다르면 그 lineComment는 잘못된 피드백이므로 출력하지 않는다.",
              "",
              "── 수정안 검증 ──",
              "개선 방안을 제시할 때는, 제안한 수정이 실제 반례를 해결하는지 확인한다.",
              "\"더 일반적으로 안전해 보인다\"는 이유만으로 루프 전체 탐색, 추가 상태 저장, 정렬, 중복 계산 허용 등을 제안하지 않는다.",
              "특히 기존 코드의 early break, greedy 종료, divisor pair shortcut, special-case guard, lazy evaluation 등은 의도된 최적화일 수 있으므로, 실제로 정답을 깨뜨리는 경우에만 제거를 제안한다.",
              "",
              "── 최소 수정 원칙 ──",
              "실제 결함이 검증되더라도, 문제를 유발한 최소 원인만 수정 대상으로 지목한다.",
              "현재 반례가 특정 조건(예: `i===1`) 때문이라면, 루프 전체 구조나 `break` 제거처럼 더 넓은 변경을 제안하지 않는다.",
              "\"더 흔한 구현\"으로 바꾸는 것은 개선 근거가 아니다.",
              "",
              "── 원인 ↔ 반례 연결 검증 ──",
              "각 lineComment는 다음 연결이 실제로 성립해야 한다: 반례 입력 → 실행 경로 → 실제 오답 발생 → 지적한 코드가 직접 원인 → 제안 수정 적용 시 반례 해결.",
              "이 연결 중 하나라도 검증되지 않으면 해당 lineComment는 출력하지 않는다.",
              "",
              "── 근거 작성·근본 원인 (중요) ──",
              "**근거**란 장문의 실행기록 전재가 아니다. 반례는 **짧게**(최소 입력·핵심 몇 단계·기대 vs 실제)만 적고, 나머지 단계는 내부 추론으로 처리한다. 반복마다 상태를 **한 줄씩 전부 복사**해 나열하는 서술은 근거가 아니라 **반례 추적의 베끼기**에 가깝다. 이런 형태는 금지한다.",
              "잘못된 최종값·헬퍼의 이상한 중간값만 길게 묘사하고, **어느 물리 줄의 어떤 조건·초깃값·상한·전달 인자**가 틀렸는지 한두 문장으로 못 박지 않으면 그 lineComment는 출력하지 않는다. \"알고리즘이 전반적으로 잘못됐다\" 같은 포괄 결론만으로는 부족하다.",
              "**문제**와 **근본 원인**(잘못된 토큰·경계·호출 규약)을 분리해 쓴다. **개선**은 \"고쳐야 한다\" 수준으로 끝내지 않고, **지적한 앵커 범위 안에서** 무엇을 어떻게 바꾸면 반례가 풀리는지 최소 수정으로 적는다. 특정 제출의 정답 코드·문제 출처의 의도 풀이를 유추하라는 뜻이 아니다.",
              "",
              "── 다중 결함 탐색 규칙 (중요) ──",
              "실제 결함이 하나 발견되더라도 즉시 리뷰를 종료하지 않는다. 코드 전체를 계속 검토하여, 서로 독립적인 추가 결함이 존재하는지 끝까지 확인한다.",
              "특히 다음을 주의한다: 하나의 반례에서 여러 원인이 동시에 존재할 수 있다. 특정 결함을 수정해도 다른 독립 결함 때문에 여전히 오답일 수 있다. 이미 찾은 버그 하나만으로 나머지 검증을 생략하지 않는다.",
              "각 결함은 반드시 독립적으로 검증한다: (1) 실제 반례 입력 존재, (2) 실행 경로 추적 가능, (3) 해당 코드가 직접 원인, (4) 해당 코드 수정 시 그 원인은 해결됨.",
              "위 조건을 만족하는 서로 다른 결함은 각각 별도의 lineComment로 작성한다.",
              "단, 다음 경우는 하나의 lineComment로 합친다: 동일 원인에서 파생된 연쇄 현상, 같은 수정으로 동시에 해결되는 문제, 사실상 동일 실행 경로·동일 반례를 반복 설명하는 경우.",
              "반대로 다음은 반드시 분리한다: 서로 다른 코드 위치가 원인인 경우, 서로 다른 반례가 필요한 경우, 하나를 수정해도 다른 문제가 남는 경우.",
              "예: 잘못된 인덱스 전달, 잘못된 early break, 누락된 special-case 처리, 잘못된 반환값 계산 등이 서로 독립 원인이면 각각 별도 lineComment로 남긴다.",
              "\"이미 더 큰 버그가 있으므로 작은 버그는 생략\" 같은 판단은 하지 않는다. 실제로 독립 결함이면 모두 검출한다.",
              "",
              "── lineComment 작성 조건 ──",
              "lineComment의 body는 **무엇이 잘못됐는지·왜 그런지(근본)·어떻게 고칠지**가 한국어로 읽는 사람에게 전달되도록 쓴다. 논리 순서는 **무엇이 문제인가 → 왜 그런가(짧은 근거·근본) → 어떻게 고칠까**를 따르되, **모든 리뷰를 동일한 굵은글씨 라벨 템플릿으로 고정해 반복하지 않는다.**",
              "한 줄 요약·짧은 단락·`#` / `##` / `###` 헤딩·목록·인용(`>`)·구분선(`---`)·짧은 표 등 **GFM 마크다운**으로 구조를 잡아 가독성을 최우선으로 한다. fenced 코드블록·언어 태그는 아래 \"출력 가독성\"을 따른다.",
              "**근거**에는 (i) 최소 반례 입력 한 개, (ii) **핵심 2~4단계**만의 실행 요지, (iii) 기대 vs 실제, 필요 시 (iv) 복잡도 정량 비교를 **짧게 조합**한다. 위 \"근거 작성·근본 원인\"을 위반하는 장문 전개는 하지 않는다.",
              "모호한 표현('i가 증가하면서…', '경우에 따라…', '위험해 보인다', '문제가 될 수 있는…')만으로는 결함을 주장할 수 없다.",
              "",
              "── 실행 추적 체크리스트 (출력 직전 필수) ──",
              "**응답 전체:** 첫 결함을 찾은 뒤에도 코드 전체를 끝까지 검토해, 독립된 추가 결함을 놓치지 않았는가? (위 \"다중 결함 탐색 규칙\")",
              "각 lineComment에 대해 출력 직전 다음 **6개** 항목을 모두 점검한다. **하나라도 만족 못 하면 그 lineComment는 작성하지 않는다.**",
              "1. 실제 입력으로 코드를 끝까지 시뮬레이션했는가?",
              "2. `break`/`return`/`continue` 흐름을 추적했는가?",
              "3. 기대 출력과 실제 출력이 실제로 다른가? (같다면 결함이 아니므로 폐기)",
              "4. 실제 실행되지 않는 분기·인덱스를 근거로 삼지 않았는가?",
              "5. 단순 스타일 차이를 버그로 오인하지 않았는가? (위 '결함으로 인정되는 경우' 4가지에 해당하는가?)",
              "6. 지적한 코드가 오답의 직접 원인인가, 제안 수정이 반례를 해결하고 기존 정상 동작을 깨지 않는가? **근거**는 장문 추적이 아니라 짧은 반례·핵심 단계·근본 원인(잘못된 경계·인자·초깃값 등)으로 압축했는가? (위 \"원인 분석 검증\"·\"수정안 검증\"·\"최소 수정\"·\"원인↔반례 연결\"·\"근거 작성·근본 원인\"을 충족하는가?)",
              "",
              "── summary 규칙 ──",
              "- lineComments가 비어 있으면: **긍정·관찰형 summary만** 작성한다. '문제'·'개선 필요'·'주의'·'여지' 같은 결함 시사 단어를 쓰지 않는다.",
              "- lineComments가 비어 있지 않으면: summary는 위 \"UI 계약\"대로 **짧은 안내 한 문장만**. 구체적 결함·수정은 **전부 lineComments의 body**에만 둔다(중복 서술 금지).",
              "- 매 실행마다 summary는 1개.",
              "",
              "── 균형 (중요) ──",
              "**'확신이 부족하다'는 이유만으로 즉시 빈 배열을 선택하지 않는다.** 대신 실제 입력을 실행 추적하고, 기대 출력과 실제 출력을 비교한 뒤, 차이가 검증되면 결함으로 판단한다. 리뷰의 핵심은 추측이 아니라 **실행 기반 검증**이다.",
              "",
              "── 출력 가독성 (Markdown 렌더 환경) ──",
              "- summary와 lineComments의 body는 한국어 부드러운 제안형(~하면 좋습니다). UI에서 Markdown(GFM)으로 렌더된다.",
              "- **가독성·이해도**를 위해 마크다운을 적극 쓴다. `#`·`##`·`###` 헤딩으로 단락을 나누고, 빈 줄로 호흡을 준다. 내용이 길어질수록 **구조를 먼저** 잡은 뒤 세부를 적는다.",
              "- \"문제·근거·개선\"의 **논리 흐름**은 유지하되, 그 **표지 문구**를 매번 동일한 굵은 라벨로 맞출 필요는 없다. 상황에 맞는 제목·소제목·목록으로 바꿔도 된다.",
              "- 함수·변수·키워드·짧은 식은 `인라인 코드`로 감싼다. 2줄 이상의 예시·수정안은 fenced 코드블록으로.",
              `- fenced 코드블록은 반드시 \`\`\`${fenceLang} 로 시작한다 ([제출 코드]와 같은 언어). JSON 문자열 안에서는 줄바꿈을 실제 개행(\\n)으로 넣어 문단·블록을 구분한다.`,
              "- 근거에 입력·중간값·기대값을 적을 때는 `- ` 목록이나 짧은 표를 써도 된다. 단, 목록이 **수십 줄의 단계 나열**이 되면 안 된다.",
              "",
              "── 앵커(줄 번호 금지) ──",
              "- 각 lineComment는 **제출 코드 원문에서 잘라 붙인 startAnchorText**(필수)와 선택적 **endAnchorText**로 구간을 가리킨다. 줄 번호를 세어 출력하지 않는다.",
              "- 앵커는 **연속 물리 줄**이어야 하며, 집단 코드 AI 비교 분석의 regions와 같은 규칙이다(잘못된 줄 추측 금지).",
              "- 한 줄만 지적하면 startAnchorText에 그 줄 전체만 넣고 endAnchorText는 생략한다. 여러 줄이면 시작 줄 전체·끝 줄 전체를 각각 넣는다.",
              "",
              "── 추가 제약 ──",
              "- 주석/Docstring/JSDoc/매개변수 설명 추가 제안은 금지. '설명이 있으면 좋습니다' 같은 문서화 위주 피드백 금지.",
              "- 코드 주석 문구를 그대로 믿지 말고 실제 코드 실행 의미로 판단한다.",
              "- lineComments 최대 10개. 같은 결함을 여러 코멘트로 쪼개지 말고 한 곳에 단일 코멘트로 정리한다.",
              "- 두 lineComments가 사실상 같은 근거·같은 수정이라면 하나로 합친다.",
              "- 제출 코드가 문제 해결 로직 없이 출력/스텁 수준이면 그 사실을 결함으로 적는다.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "다음 코드를 [문제 문맥]·[문제 본문 핵심] 기준으로 리뷰해줘.",
              "검증된 결함만 lineComments에 넣어줘. **결함 0개도 정상 결과**다.",
              "구체적 버그 설명(원인·반례·수정)은 summary가 아니라 **해당 코드 줄 범위의 lineComments**에만 넣어줘. summary는 짧게.",
              "각 lineComment는 body와 **제출 코드에서 복사한 startAnchorText**(및 필요 시 endAnchorText)로 구간을 표시해줘. 줄 번호는 쓰지 마.",
              "결함을 주장하기 전 반드시 실제 입력으로 코드를 끝까지 실행 추적하고, 기대 출력과 실제 출력을 비교해줘. 둘이 같으면 그 lineComment는 폐기.",
              "원인·수정안은 위 \"원인 분석 검증\"·\"수정안 검증\"·\"최소 수정\"·\"원인↔반례 연결\" 규칙까지 통과한 것만 lineComments에 넣어줘.",
              "독립적인 결함이 둘 이상이면 각각 별도 lineComment로 남기고, 한 건만 찾았다고 전체 검토를 멈추지 마. 합치기·분리는 위 \"다중 결함 탐색 규칙\"을 따른다.",
              "**근거**는 소설처럼 길게 쓰지 말고, 짧은 반례와 근본 원인 중심으로 써. 특정 문제의 정답 풀이·정답에 가까운 구체 식을 암시하지 말고, system 메시지의 \"근거 작성·근본 원인\"·\"원인 분석 검증\"만 따른다.",
              "lineComment body는 헤딩·코드블록·목록 등 마크다운으로 읽기 좋게 써. `**문제:**` / `**근거:**` / `**개선:**` 같은 고정 템플릿에 매번 얽매이지 마.",
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
                : "(문제 본문 추출 실패: URL 응답/파싱 실패) — 본문 정보 없이는 결함 단정을 극히 줄이고, 일반론으로 빈칸을 메우지 말 것.",
              "[/문제 본문 핵심]",
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
      });
      return parseAiReviewPayload(response.content, code);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("_http_")) {
        this.logger.warn(`AI 리뷰 LLM 업스트림 실패: ${message}`);
        throw new BadRequestException("AI 리뷰 요청에 실패했습니다.");
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`AI 리뷰 처리 실패: ${message.length > 0 ? message : String(error)}`);
      throw new BadRequestException("AI 리뷰 요청에 실패했습니다.");
    }
  }

}
