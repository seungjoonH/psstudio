// 제출 CRUD/버전/diff API 컨트롤러입니다.
import {
  Body,
  Controller,
  Delete,
  Dependencies,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { AssignmentsService } from "../assignments/assignments.service.js";
import { GroupsService } from "../groups/groups.service.js";
import { canPerform } from "../groups/permissions.js";
import type { SubmissionCommentReplyItem } from "./submissions.service.js";
import { SubmissionsService } from "./submissions.service.js";

class CreateSubmissionBody {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsString() @MinLength(1) @MaxLength(50) language!: string;
  @IsString() @Length(1, 200 * 1024) code!: string;
  @IsOptional() @IsString() @MaxLength(20000) noteMarkdown?: string;
}

class UpdateSubmissionCodeBody {
  @IsString() @MinLength(1) @MaxLength(50) language!: string;
  @IsString() @Length(1, 200 * 1024) code!: string;
}

class RenameSubmissionBody {
  @IsString() @MinLength(1) @MaxLength(100) title!: string;
}

class UpdateSubmissionNoteBody {
  @IsString() @MaxLength(20000) noteMarkdown!: string;
}

class ListQuery {
  @IsOptional() @IsIn(["createdAtAsc", "createdAtDesc"]) sort?: "createdAtAsc" | "createdAtDesc";
  @IsOptional() @IsString() authorId?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() isLate?: string;
}

class DiffQuery {
  @Type(() => Number) @IsInt() @Min(0) from!: number;
  @Type(() => Number) @IsInt() @Min(1) to!: number;
}

class ListReviewsQuery {
  @Type(() => Number) @IsInt() @Min(1) versionNo!: number;
}

class CreateReviewBody {
  @Type(() => Number) @IsInt() @Min(1) versionNo!: number;
  @Type(() => Number) @IsInt() @Min(1) startLine!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) endLine?: number;
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}

class CreateCommentBody {
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  @IsOptional() @IsString() parentCommentId?: string;
}

class CreateAiReviewBody {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) versionNo?: number;
}

function serializeListItem(item: Awaited<ReturnType<SubmissionsService["list"]>>[number]) {
  return {
    id: item.id,
    assignmentId: item.assignmentId,
    authorUserId: item.authorUserId,
    authorNickname: item.authorNickname,
    authorProfileImageUrl: item.authorProfileImageUrl,
    title: item.title,
    language: item.language,
    isLate: item.isLate,
    currentVersionNo: item.currentVersionNo,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeDetail(detail: Awaited<ReturnType<SubmissionsService["getDetail"]>>) {
  return {
    ...serializeListItem(detail),
    latestCode: detail.latestCode,
    noteMarkdown: detail.noteMarkdown,
    currentVersionHasAiFeedback: detail.currentVersionHasAiFeedback,
    versions: detail.versions.map((v) => ({
      versionNo: v.versionNo,
      language: v.language,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

function serializeComment(item: Awaited<ReturnType<SubmissionsService["listComments"]>>[number]) {
  return {
    id: item.id,
    body: item.body,
    submissionVersionNo: item.submissionVersionNo,
    authorUserId: item.authorUserId,
    authorNickname: item.authorNickname,
    authorProfileImageUrl: item.authorProfileImageUrl,
    createdAt: item.createdAt.toISOString(),
    reactions: item.reactions,
    replies: item.replies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      submissionVersionNo: reply.submissionVersionNo,
      authorUserId: reply.authorUserId,
      authorNickname: reply.authorNickname,
      authorProfileImageUrl: reply.authorProfileImageUrl,
      parentCommentId: reply.parentCommentId,
      createdAt: reply.createdAt.toISOString(),
      reactions: reply.reactions,
    })),
  };
}

function serializeCommentReply(item: SubmissionCommentReplyItem) {
  return {
    id: item.id,
    body: item.body,
    submissionVersionNo: item.submissionVersionNo,
    authorUserId: item.authorUserId,
    authorNickname: item.authorNickname,
    authorProfileImageUrl: item.authorProfileImageUrl,
    parentCommentId: item.parentCommentId,
    createdAt: item.createdAt.toISOString(),
    reactions: item.reactions,
  };
}

function serializeReview(item: Awaited<ReturnType<SubmissionsService["listReviews"]>>[number]) {
  return {
    id: item.id,
    versionNo: item.versionNo,
    reviewType: item.reviewType,
    startLine: item.startLine,
    endLine: item.endLine,
    body: item.body,
    authorUserId: item.authorUserId,
    authorNickname: item.authorNickname,
    authorProfileImageUrl: item.authorProfileImageUrl,
    createdAt: item.createdAt.toISOString(),
    reactions: item.reactions,
    replies: item.replies.map((reply) => ({
      id: reply.id,
      reviewId: reply.reviewId,
      parentReplyId: reply.parentReplyId,
      authorUserId: reply.authorUserId,
      authorNickname: reply.authorNickname,
      authorProfileImageUrl: reply.authorProfileImageUrl,
      body: reply.body,
      isAdminHidden: reply.isAdminHidden,
      createdAt: reply.createdAt.toISOString(),
      updatedAt: reply.updatedAt.toISOString(),
      reactions: reply.reactions,
    })),
  };
}

@Controller()
@Dependencies(SubmissionsService, AssignmentsService, GroupsService)
@UseGuards(AuthGuard)
export class SubmissionsController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly assignments: AssignmentsService,
    private readonly groups: GroupsService,
  ) {}

  @Get("api/v1/assignments/:assignmentId/submissions")
  async list(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
    @Query() query: ListQuery,
  ) {
    const a = await this.assignments.getById(assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const items = await this.submissions.list(assignmentId, {
      sort: query.sort,
      authorId: query.authorId,
      language: query.language,
      isLate: query.isLate === undefined ? undefined : query.isLate === "true",
    });
    return { success: true, data: items.map(serializeListItem) };
  }

  @Post("api/v1/assignments/:assignmentId/submissions")
  async create(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
    @Body() body: CreateSubmissionBody,
  ) {
    const a = await this.assignments.getById(assignmentId);
    const role = await this.groups.requireRole(a.groupId, me.id);
    if (!canPerform(role, "SUBMISSION_CREATE_OWN")) throw new ForbiddenException();
    const s = await this.submissions.create(assignmentId, me.id, body);
    return { success: true, data: serializeDetail(await this.submissions.getDetail(s.id)) };
  }

  @Get("api/v1/submissions/:submissionId")
  async getOne(@CurrentUser() me: { id: string }, @Param("submissionId") submissionId: string) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    return { success: true, data: serializeDetail(detail) };
  }

  @Get("api/v1/submissions/:submissionId/versions/:versionNo")
  async getVersion(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Param("versionNo") versionNoRaw: string,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const versionNo = Number(versionNoRaw);
    if (!Number.isInteger(versionNo) || versionNo < 1) {
      throw new ForbiddenException("잘못된 버전 번호입니다.");
    }
    return {
      success: true,
      data: await this.submissions.getVersionCode(submissionId, versionNo),
    };
  }

  @Patch("api/v1/submissions/:submissionId/code")
  async updateCode(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Body() body: UpdateSubmissionCodeBody,
  ) {
    return {
      success: true,
      data: await this.submissions.updateCode(submissionId, me.id, body),
    };
  }

  @Patch("api/v1/submissions/:submissionId/title")
  async rename(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Body() body: RenameSubmissionBody,
  ) {
    await this.submissions.rename(submissionId, me.id, body.title);
    return { success: true, data: { ok: true } };
  }

  @Patch("api/v1/submissions/:submissionId/note")
  async updateNote(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Body() body: UpdateSubmissionNoteBody,
  ) {
    await this.submissions.updateNoteMarkdown(submissionId, me.id, body.noteMarkdown);
    return { success: true, data: { ok: true } };
  }

  @Delete("api/v1/submissions/:submissionId")
  @HttpCode(200)
  async delete(@CurrentUser() me: { id: string }, @Param("submissionId") submissionId: string) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    const role = await this.groups.requireRole(a.groupId, me.id);
    const isManager = canPerform(role, "SUBMISSION_DELETE_ANY");
    await this.submissions.delete(submissionId, me.id, isManager);
    return { success: true, data: { ok: true } };
  }

  @Get("api/v1/submissions/:submissionId/diff")
  async diff(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Query() query: DiffQuery,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    return {
      success: true,
      data: await this.submissions.getDiff(submissionId, query.from, query.to),
    };
  }

  @Get("api/v1/submissions/:submissionId/reviews")
  async listReviews(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Query() query: ListReviewsQuery,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const items = await this.submissions.listReviews(submissionId, query.versionNo, me.id);
    return { success: true, data: items.map(serializeReview) };
  }

  @Post("api/v1/submissions/:submissionId/reviews")
  async createReview(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Body() body: CreateReviewBody,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const review = await this.submissions.createReview(submissionId, me.id, body);
    return { success: true, data: serializeReview(review) };
  }

  @Get("api/v1/submissions/:submissionId/comments")
  async listComments(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const items = await this.submissions.listComments(submissionId, me.id);
    return { success: true, data: items.map(serializeComment) };
  }

  @Post("api/v1/submissions/:submissionId/comments")
  async createComment(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Body() body: CreateCommentBody,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const a = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const result = await this.submissions.createComment(
      submissionId,
      me.id,
      body.body,
      body.parentCommentId ?? null,
    );
    if ("replies" in result) {
      return { success: true, data: serializeComment(result) };
    }
    return { success: true, data: serializeCommentReply(result) };
  }

  @Post("api/v1/submissions/:submissionId/ai-review")
  async requestAiReview(
    @CurrentUser() me: { id: string },
    @Param("submissionId") submissionId: string,
    @Body() body: CreateAiReviewBody,
  ) {
    const detail = await this.submissions.getDetail(submissionId);
    const assignment = await this.assignments.getById(detail.assignmentId);
    await this.groups.requireRole(assignment.groupId, me.id);
    const group = await this.groups.getById(assignment.groupId);
    if (!group.ruleUseAiFeedback) {
      throw new ForbiddenException("AI 피드백이 비활성화된 그룹입니다.");
    }
    if (detail.authorUserId !== me.id) {
      throw new ForbiddenException("AI 리뷰 요청 권한이 없습니다.");
    }
    return {
      success: true,
      data: await this.submissions.requestAiReview(submissionId, me.id, body.versionNo),
    };
  }

  @Post("api/v1/submissions/detect-language")
  @HttpCode(200)
  async detectLang(@Body() body: { code: string }) {
    const { detectLanguage } = await import("./language-detect.js");
    return { success: true, data: detectLanguage(body.code ?? "") };
  }
}
