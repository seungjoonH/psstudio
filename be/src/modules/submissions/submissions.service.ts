// 제출 CRUD/버전/diff를 관리하는 서비스입니다.
import {
  BadRequestException,
  ConflictException,
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
import { buildSubmissionReviewLlmMessages } from "../../experiment/submission-review-llm-messages.js";
import {
  type AssignmentReviewContext,
} from "./submission-review-prompt-utils.js";
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
  /** 현재 최신 버전에 AI 튜터 댓글 또는 인라인 리뷰가 이미 있는지(삭제되지 않은 행 기준). */
  currentVersionHasAiFeedback: boolean;
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

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function clip(text: string, max = 5000): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
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
        "요약 문구를 자동으로 다듬지 못했습니다. 인라인 코멘트를 먼저 봐 주시면 도움이 될 수 있습니다.";
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

  /** AI 튜터 사용자 행이 없거나 소프트삭제된 경우 null입니다(getDetail 등 읽기 전용 경로용). */
  private async getAiTutorUserId(): Promise<string | null> {
    await this.ensureInitialized();
    const user = await this.ds.getRepository(User).findOne({
      where: { provider: "system", providerUserId: "ai-tutor" },
      withDeleted: true,
    });
    if (user === null || user.deletedAt !== null) return null;
    return user.id;
  }

  private async submissionVersionHasAiFeedback(
    submissionId: string,
    version: SubmissionVersion,
    botUserId: string,
  ): Promise<boolean> {
    const existingComment = await this.ds.getRepository(Comment).findOne({
      where: {
        submissionId,
        submissionVersionNo: version.versionNo,
        authorUserId: botUserId,
      },
    });
    if (existingComment !== null) return true;
    const existingReview = await this.ds.getRepository(Review).findOne({
      where: {
        submissionVersionId: version.id,
        authorUserId: botUserId,
      },
    });
    return existingReview !== null;
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
    const currentVersionRow = versions.find((v) => v.versionNo === s.currentVersionNo);
    let currentVersionHasAiFeedback = false;
    if (currentVersionRow !== undefined) {
      const botId = await this.getAiTutorUserId();
      if (botId !== null) {
        currentVersionHasAiFeedback = await this.submissionVersionHasAiFeedback(s.id, currentVersionRow, botId);
      }
    }
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
      currentVersionHasAiFeedback,
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
    const authorNickname = user?.nickname ?? "탈퇴한 사용자";
    if (submission.authorUserId !== authorUserId) {
      const notifRepo = this.ds.getRepository(Notification);
      await notifRepo.save(
        notifRepo.create({
          recipientUserId: submission.authorUserId,
          type: NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION,
          payload: {
            title: `${authorNickname}님이 내 제출에 댓글을 달았습니다.`,
            submissionId,
            assignmentId: submission.assignmentId,
            groupId: assignment.groupId,
            reviewId: review.id,
            versionNo: payload.versionNo,
            actorUserId: authorUserId,
            actorNickname: authorNickname,
            actorProfileImageUrl: user?.profileImageUrl ?? "",
          },
        }),
      );
    }
    return {
      id: review.id,
      versionNo: payload.versionNo,
      reviewType,
      startLine: payload.startLine,
      endLine,
      body: review.body,
      authorUserId,
      authorNickname,
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
              title: `${authorNickname}님이 내 제출에 댓글을 달았습니다.`,
              submissionId,
              assignmentId: submission.assignmentId,
              groupId: assignment.groupId,
              commentId: comment.id,
              actorUserId: authorUserId,
              actorNickname: authorNickname,
              actorProfileImageUrl: user?.profileImageUrl ?? "",
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
            title: `${authorNickname}님이 내 댓글에 답글을 달았습니다.`,
            submissionId,
            assignmentId: submission.assignmentId,
            groupId: assignment.groupId,
            commentId: comment.id,
            parentCommentId,
            actorUserId: authorUserId,
            actorNickname: authorNickname,
            actorProfileImageUrl: user?.profileImageUrl ?? "",
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
    if (await this.submissionVersionHasAiFeedback(submissionId, version, botUser.id)) {
      throw new ConflictException("이 버전에는 이미 AI 피드백이 있습니다.");
    }
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

    let summaryBody =
      aiPayload.summary.trim().length > 0
        ? aiPayload.summary.trim()
        : "리뷰 요약을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.";

    /** 모델이 lineComments를 줬지만 앵커·줄 클램프 후 인라인 Review가 0개면 UI에 코드 옆 스레드가 안 생긴다. 본문에 병합하고 안내한다. */
    const modelReturnedLineComments = aiPayload.lineComments.length > 0;
    if (lineComments.length === 0 && modelReturnedLineComments) {
      const appendix = aiPayload.lineComments
        .map((c) => c.body.trim())
        .filter((b) => b.length > 0)
        .join("\n\n---\n\n");
      const note =
        "인라인 코드 리뷰는 제출 원문 줄과의 앵커 매칭에 실패해 코드 옆에 표시되지 못했습니다. 의도했던 설명은 아래에 이어 붙입니다.";
      summaryBody =
        appendix.length > 0 ? `${note}\n\n${summaryBody}\n\n---\n\n${appendix}` : `${note}\n\n${summaryBody}`;
    }

    await this.ds.transaction(async (tx) => {
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
    try {
      const { messages, temperature, maxTokens } = buildSubmissionReviewLlmMessages(
        code,
        noteMarkdown,
        context,
        problemContext,
        codeLanguage,
      );
      const response = await requestLlmChat({
        model: ENV.llmModelSubmissionReview(),
        temperature,
        maxTokens,
        messages,
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
