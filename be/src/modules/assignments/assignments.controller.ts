// 과제 CRUD API 컨트롤러입니다.
import {
  Body,
  Controller,
  Delete,
  Dependencies,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import type { ProblemPlatform } from "@psstudio/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { GroupsService } from "../groups/groups.service.js";
import { canPerform } from "../groups/permissions.js";
import { normalizeCohortReportLocale } from "./cohort-analysis-bundle.js";
import { AssignmentCohortAnalysisService } from "./assignment-cohort-analysis.service.js";
import { AssignmentsService } from "./assignments.service.js";

class CreateAssignmentBody {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) hint?: string;
  @IsUrl({ require_protocol: true }) problemUrl!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) dueAt!: string;
  @IsBoolean() allowLateSubmission!: boolean;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) assigneeUserIds?: string[];
}

class UpdateAssignmentBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) hint?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) problemUrl?: string;
  @IsOptional() @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) dueAt?: string;
  @IsOptional() @IsBoolean() allowLateSubmission?: boolean;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) assigneeUserIds?: string[];
}

class UpdateMetadataBody {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(50) difficulty?: string;
  @IsOptional() @IsIn(["BOJ", "Programmers", "LeetCode", "Other"]) platform?: ProblemPlatform;
  @IsOptional() @IsArray() @IsString({ each: true }) algorithms?: string[];
  @IsOptional() @IsBoolean() hintHiddenUntilSubmit?: boolean;
  @IsOptional() @IsBoolean() algorithmsHiddenUntilSubmit?: boolean;
}

class DeleteAssignmentBody {
  @IsString() confirmTitle!: string;
}

class AutofillAssignmentBody {
  @IsUrl({ require_protocol: true }) problemUrl!: string;
}

type AutofillHintLocale = "ko" | "en";

function normalizeAutofillHintLocale(acceptLanguage?: string): AutofillHintLocale {
  const first = acceptLanguage
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (first?.startsWith("en")) return "en";
  return "ko";
}

function serialize(a: Awaited<ReturnType<AssignmentsService["getById"]>>) {
  return {
    id: a.id,
    groupId: a.groupId,
    title: a.title,
    hintPlain: a.hintPlain,
    problemUrl: a.problemUrl,
    platform: a.platform,
    difficulty: a.difficulty,
    dueAt: a.dueAt.toISOString(),
    allowLateSubmission: a.allowLateSubmission,
    createdByUserId: a.createdByUserId,
    createdAt: a.createdAt.toISOString(),
    metadata: a.metadata,
    analysisStatus: a.analysisStatus,
    isLate: a.isLate,
    assigneeUserIds: a.assigneeUserIds,
    assignees: a.assignees,
    isAssignedToMe: a.isAssignedToMe,
  };
}

@Controller()
@Dependencies(AssignmentsService, GroupsService, AssignmentCohortAnalysisService)
@UseGuards(AuthGuard)
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly groups: GroupsService,
    private readonly cohortAnalysis: AssignmentCohortAnalysisService,
  ) {}

  @Get("api/v1/groups/:groupId/assignments")
  async list(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    await this.groups.requireRole(groupId, me.id);
    return { success: true, data: (await this.assignments.list(groupId, me.id)).map(serialize) };
  }

  @Post("api/v1/groups/:groupId/assignments")
  async create(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Body() body: CreateAssignmentBody,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "ASSIGNMENT_CREATE")) throw new ForbiddenException();
    const a = await this.assignments.create(groupId, me.id, {
      title: body.title,
      hint: body.hint,
      problemUrl: body.problemUrl,
      dueAt: new Date(body.dueAt),
      allowLateSubmission: body.allowLateSubmission,
      assigneeUserIds: body.assigneeUserIds,
    }, role);
    return { success: true, data: serialize(await this.assignments.getById(a.id, me.id)) };
  }

  @Post("api/v1/groups/:groupId/assignments/autofill")
  async autofill(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Body() body: AutofillAssignmentBody,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "ASSIGNMENT_CREATE")) throw new ForbiddenException();
    return {
      success: true,
      data: await this.assignments.autofillFromAi(
        body.problemUrl,
        normalizeAutofillHintLocale(acceptLanguage),
      ),
    };
  }

  @Get("api/v1/assignments/:assignmentId")
  async getOne(@CurrentUser() me: { id: string }, @Param("assignmentId") assignmentId: string) {
    const a = await this.assignments.getById(assignmentId, me.id);
    await this.groups.requireRole(a.groupId, me.id);
    return { success: true, data: serialize(a) };
  }

  @Get("api/v1/assignments/:assignmentId/cohort-analysis")
  async getCohortAnalysis(@CurrentUser() me: { id: string }, @Param("assignmentId") assignmentId: string) {
    const a = await this.assignments.getById(assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    return { success: true, data: await this.cohortAnalysis.getForAssignment(assignmentId) };
  }

  @Post("api/v1/assignments/:assignmentId/cohort-analysis")
  async startCohortAnalysis(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
    @Headers("accept-language") acceptLanguage?: string,
    @Body() body?: { rerun?: boolean },
  ) {
    const a = await this.assignments.getById(assignmentId);
    await this.groups.requireRole(a.groupId, me.id);
    const reportLocale = normalizeCohortReportLocale(acceptLanguage);
    const rerun = body !== null && typeof body === "object" && body.rerun === true;
    return {
      success: true,
      data: await this.cohortAnalysis.trigger(assignmentId, me.id, reportLocale, { rerun }),
    };
  }

  @Patch("api/v1/assignments/:assignmentId")
  async update(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
    @Body() body: UpdateAssignmentBody,
  ) {
    const a = await this.assignments.getById(assignmentId);
    const role = await this.groups.requireRole(a.groupId, me.id);
    if (!canPerform(role, "ASSIGNMENT_UPDATE")) throw new ForbiddenException();
    await this.assignments.update(assignmentId, {
      title: body.title,
      hint: body.hint,
      problemUrl: body.problemUrl,
      dueAt: body.dueAt === undefined ? undefined : new Date(body.dueAt),
      allowLateSubmission: body.allowLateSubmission,
      assigneeUserIds: body.assigneeUserIds,
    }, me.id, role);
    return { success: true, data: serialize(await this.assignments.getById(assignmentId, me.id)) };
  }

  @Patch("api/v1/assignments/:assignmentId/metadata")
  async updateMetadata(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
    @Body() body: UpdateMetadataBody,
  ) {
    const a = await this.assignments.getById(assignmentId);
    const role = await this.groups.requireRole(a.groupId, me.id);
    if (!canPerform(role, "ASSIGNMENT_METADATA_EDIT")) throw new ForbiddenException();
    await this.assignments.updateMetadata(assignmentId, body);
    return { success: true, data: serialize(await this.assignments.getById(assignmentId, me.id)) };
  }

  @Get("api/v1/assignments/:assignmentId/deletion-impact")
  async deletionImpact(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
  ) {
    const a = await this.assignments.getById(assignmentId);
    const role = await this.groups.requireRole(a.groupId, me.id);
    if (!canPerform(role, "ASSIGNMENT_DELETE")) throw new ForbiddenException();
    return { success: true, data: await this.assignments.getDeletionImpact(assignmentId) };
  }

  @Delete("api/v1/assignments/:assignmentId")
  @HttpCode(200)
  async delete(
    @CurrentUser() me: { id: string },
    @Param("assignmentId") assignmentId: string,
    @Body() body: DeleteAssignmentBody,
  ) {
    const a = await this.assignments.getById(assignmentId);
    const role = await this.groups.requireRole(a.groupId, me.id);
    if (!canPerform(role, "ASSIGNMENT_DELETE")) throw new ForbiddenException();
    return { success: true, data: await this.assignments.delete(assignmentId, body.confirmTitle) };
  }
}
