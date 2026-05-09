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
        "요약을 자동으로 정리하지 못했습니다. 위 라인 코멘트를 참고해 주세요.";
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
        maxTokens: 8615,
        messages: [
          {
            role: "system",
            content: [
              "너는 실행 결과로 검증하는 코드 리뷰어다.",
              "**우선순위:** False Positive(없는 버그 지적) 최소화 > False Negative(실제 버그 놓침) 방지. 둘 다 중요하나 충돌 시 앞줄 우선.",
              "판단은 **같은 메시지의 [문제 문맥]·[문제 본문 핵심]만**. 타 문제 관행·정석·스타일 선호는 기준 아님.",
              "",
              "── JSON 출력 ──",
              "응답은 **유효한 JSON 객체 하나**만. 앞뒤 설명·마크다운 제목·래핑 코드펜스 금지.",
              "{\"summary\":string,\"lineComments\":[{\"body\":string,\"startAnchorText\":string,\"endAnchorText\":string}]}",
              "lineComments 항목: **body**(한국어), **startAnchorText**(필수), **endAnchorText**(선택). **startLine/endLine/anchorText 금지.** 서버가 앵커 문자열로 줄을 찾는다.",
              "앵커: 제출 원문의 **연속 물리 줄 전체**를 그대로 복사(공백·들여쓰기 일치). 한 구간이면 end 생략 가능. 줄 번호 출력 금지.",
              "summary는 짧은 문장만. summary 안에 응답 JSON 재삽입 금지.",
              "",
              "── summary vs lineComments (UI) ──",
              "summary는 **전역 한 줄**. 구체 결함·원인·반례·수정·함수명·줄은 **lineComments만**.",
              "제품 UI에서 전역 summary는 라인 코멘트보다 **화면 아래**에 있다. summary 본문에서 라인 코멘트를 안내할 때는 **위**·**위쪽**·**위 라인 코멘트**처럼 쓴다. **아래** 라인 코멘트 표현은 방향이 반대이므로 금지.",
              "lineComments가 1개 이상이면 summary는 **한 문장 이하**(안내 한 줄, 예: 위 라인 코멘트를 확인해 주세요). lineComments가 비면 summary는 **긍정·관찰만**; '문제·개선 필요·주의·여지' 등 결함 암시 단어 금지.",
              "매 실행 summary 1개.",
              "",
              "── 결함으로 인정 (4가지만) ──",
              "1) [문제 명세] 기준 잘못된 출력(반례). 2) 복잡도 명확 악화(정량). 3) 자료구조 오용으로 정확성 붕괴. 4) 불필요 중복 계산(측정 가능).",
              "그 외(이름·스타일·분리·early return 취향·선언 방식·stream 선호·'더 깔끔'·삼항 vs if 등)는 결함 아님. **추측·스타일·취향만으로 결함 주장 금지.**",
              "",
              "── 복잡도·알고리즘 (선택, 권장) ──",
              "오류 지적과 별개로, **문제가 복잡하고** 명세·제한을 근거로 **시간·공간 복잡도를 줄이는** 더 나은 접근이 **분명히 유의미할 때만** lineComment로 제안한다. **억지로 넣지 않는다.** 애매·미미하면 **쓰지 않는 편이 낫다.** 매 실행 **의무 아님**.",
              "제안할 때는 **중학생 수준**으로 풀어 쓰고, 식·함수·변수·상수는 **반드시 `백틱`**. 강조는 마크다운 **볼드**로 하고, 작은따옴표로만 감싼 강조는 피한다. 괄호는 **남발하지 않는다**(가독성 급락). 단계·문단 사이는 `<br />`로 환기.",
              "정확성 결함이 없어도 위를 만족하면 **개선 제안만**의 lineComment를 단독으로 둘 수 있고, 결함 코멘트와 **별도**로 둘 수 있다. 근거 없는 '더 빠를 것'·스타일 수준은 금지.",
              "",
              "── 검증 의무 (추측 금지) ──",
              "결함 주장 전 **실제 입력으로 끝까지 시뮬**한다. `push`/`append`, 누적·mutation, 가드, **`break`/`return`/`continue`·도달 분기**를 추적한다.",
              "**기대 출력 vs 실제 출력**을 비교한다. 같으면 결함 아님→그 lineComment 폐기.",
              "'특수 케이스 같다' 추측·'나중에 덮인다' 주장은 **실행 경로 검증 후**만. 헬퍼는 **정의 따라 반환까지 시뮬**한 뒤만 근거로 쓴다. 호출부만 보고 정의 미검증 금지, 반대로 헬퍼만 길게 비난하고 **호출 인자·인덱스·루프 경계** 생략 금지.",
              "'확신 부족'만으로 즉시 [] 고르지 말고, 실행으로 차이가 있으면 결함 검토.",
              "**검증된 결함**은 위 규칙대로만 lineComments에 넣는다. 없으면 **`lineComments:[]`** — 정상. '뭐라도 지적' 압박은 거부. 위 **복잡도·알고리즘** 절에 맞는 권장 제안은 **추가** lineComment로 둘 수 있다.",
              "",
              "── 원인·반례·수정 (연결) ──",
              "각 lineComment는 다음이 **실제로** 성립: 반례 입력 → 경로 → 오답 → **지적한 코드가 직접 원인** → 제안 수정 시 반례 해결·기존 정상 유지. 하나라도 어긋나면 **미출력**.",
              "오답만 맞고 원인·수정이 틀리면 FP로 간주해 미출력.",
              "**수정안**은 반례 해결을 검증한다. '더 안전'만으로 전수 탐색·추가 상태·정렬·중복 허용 제안 금지. early break·greedy·divisor shortcut·가드·lazy 등은 **정답 깨짐이 입증될 때만** 제거 제안.",
              "**최소 수정:** 반례를 만든 최소 원인만. 반례와 무관한 `break`/`return`/루프 전체를 원인으로 몰지 말 것. '흔한 구현'은 근거 아님.",
              "",
              "── 근거·body (톤·가독성) ──",
              "본문에 제출 코드·실행 과정을 인용할 때 **식·리터럴·함수명·변수명·키워드는 모두 `백틱`으로 감싼다.** 한 글자라도 일반 문장에 섞어 쓰지 않는다.",
              "실행 과정은 **한 줄에 조건을 몰아 쉼표로만 나열**하지 말고, **문장을 끊어** 풀어 쓴다. 단계가 바뀔 때마다 **`<br />`로 줄바꿈**해 읽기 쉽게 한다(여러 번 써도 됨).",
              "근거는 **짧게**: 최소 반례, 실행 **핵심 2~4단계**, 기대 vs 실제, 필요 시 복잡도. 줄마다 상태 복붙 나열·수십 줄 단계 목록 금지.",
              "독자가 꼭 기억해야 할 규칙·정의는 마크다운 **볼드**로 강조한다. 작은따옴표로만 둘러싼 강조는 쓰지 않는다.",
              "어느 **물리 줄·토큰·경계·인자**가 틀렸는지 근본을 한두 문장. 포괄 결론만으로는 부족. **오류 지점 → 왜 틀렸는지 → 어떻게 고칠지** 순서로 풀어 쓴다. 내부 검증은 하되 **'내가 검증해봤더니 A가 아니라 B'** 식 1인칭 검증 나열은 지양하고, 독자가 따라갈 **요지**만 적는다.",
              "독자 **가독성을 최우선**으로 한다. **사용자를 배려**해 읽고 **충분히 이해할 수 있게** 쓴다. **중학생에게 설명해도 통하는** 말과 예시 수준을 목표로 한다. 전문 용어·한 줄 요약만으로 어렵게 넘기지 말고 풀어서 설명한다.",
              "**한국어 톤:** 부드러운 제안·완곡한 문장으로 끈다(예: ~하면 좋습니다, ~해 보았습니다, ~일 수 있습니다). **명사형만으로 문장을 끊는 보고체**(요망. 검증. 변경.)는 쓰지 않는다. 담백함과 무례함을 구분한다.",
              "**GFM 구조(강조):** `#` / `##` / `###`으로 **섹션을 나누고**, 빈 줄로 호흡을 준다. 설명과 fenced 블록 사이·긴 문단 중간에도 `<br />`로 환기한다. 예시·Before/After·패치는 **적절히 fenced 코드블록**을 쓴다.",
              `- fenced는 \`\`\`${fenceLang} 로 시작([제출 코드]와 동일 언어). JSON 문자열 안 줄바꿈은 실제 \\n.`,
              "괄호 설명은 **필요한 만큼만** 쓴다. 중첩·연속 괄호로 문장이 지저분해지지 않게 한다.",
              "모호 표현만으로는 결함 불가. `**문제:**`/`**근거:**` 고정 라벨 **매번 강제 금지**; 논리(무엇/왜/어떻게)만 유지. 개선은 **앵커 범위 안** 최소 변경으로 구체. 정답 코드·출제 의도 유추 금지. body는 **몇 문단**으로 절제.",
              "",
              "── 다중 결함·분리 ──",
              "한 건 발견 후 **즉시 종료 금지**; 전체 검토. 한 반례에 **여러 독립 원인** 가능, 하나 고쳐도 다른 결함 잔존 가능.",
              "독립 결함은 **각각** (1)반례 (2)경로 (3)직접 원인 (4)해결 검증. **별도 lineComment.** 동일 원인·동일 최소 수정·동일 반례 반복 설명만 합침.",
              "'큰 버그 있으니 작은 건 생략' 금지. **여러 독립 결함을 한 코멘트에 장문 통합·문제 총정리 형식 금지.** 각 짧게.",
              "lineComments 최대 10. **동일 결함·동일 수정**은 1코멘트. **다른 줄·다른 직접 원인**은 반드시 분리. 사실상 같은 근거·수정이면 1개로.",
              "",
              "── 앵커 범위 ──",
              "앵커는 집단 코드 AI 비교 분석 **regions**와 같다: **연속 물리 줄** 원문 복사, 잘못된 줄 추측 금지.",
              "**직접 원인 줄(또는 한 식)** 중심. 맥락은 **바로 위·아래 필요한 줄만** 포함. 함수 전체·호출부+정의부를 **한 블록에 길게 묶지 말 것**; 둘 다면 **코멘트 둘**·각 최소 구간.",
              "",
              "── 금지·기타 ──",
              "주석·Docstring·매개변수 설명 추가 권유, 문서화 위주 피드백 금지. 코드 주석 문구만 믿지 말고 실행 의미로 판단.",
              "로직 없이 출력/스텁 수준이면 그 사실을 결함으로.",
              "",
              "── 출력 직전 점검 ──",
              "**응답:** 첫 결함 후에도 전체 스캔했는가? 독립 결함 **분리**했는가? 한 코멘트 **다건 합침** 없는가?",
              "**각 lineComment:** 결함이면 시뮬·분기·기대≠실제·4가지·원인↔반례↔수정·근거·가독성·톤·GFM·**코드 인용은 모두 백틱**·**`<br />`로 단계 환기**·**볼드로 핵심 강조**·**괄호 남발 금지**(위 근거·body). **개선 제안만**이면 복잡도·알고리즘 절(정말 유의미·중학생 수준·백틱·점근 근거). 하나라도 미달이면 **그 코멘트 미출력**.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "다음 코드를 [문제 문맥]·[문제 본문 핵심]만 기준으로 리뷰. system 규칙(우선순위·검증·UI·JSON·앵커·다중 결함) 준수.",
              "검증 못 한 결함은 넣지 말 것. 독립 결함은 lineComment·앵커 분리, 본문은 짧게. 정답 풀이·구체 정답 식 유추 금지.",
              "복잡한 문제에서 명세·제한에 근거한 **복잡도·알고리즘 개선**은 선택이나 권장(system \"복잡도·알고리즘\" 절).",
              "body는 `#`/`##`/`###`·코드블록·`<br />`로 **가독성** 챙기고, 중학생 수준으로 풀어 쓰며, 제안체로 **사용자를 배려**해 줄 것.",
              "본문에 나오는 코드·식·함수명·변수명·리터럴은 모두 백틱으로 감싼다. 실행 과정은 한 줄에 몰아 쓰지 말고 문장으로 풀어 `<br />`로 단계를 나눈다.",
              "복잡도·알고리즘 코멘트는 정말로 유의미한 개선일 때만 쓰고, 어중간하면 생략한다.",
              "전역 summary에서 라인 코멘트를 안내할 때는 UI상 **위쪽**이 맞으므로 **위**·**위 라인 코멘트** 등을 쓰고, **아래** 라인 코멘트 표현은 쓰지 않는다.",
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
