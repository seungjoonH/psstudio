// 그룹 CRUD와 멤버/역할 API 컨트롤러입니다.
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
  UseGuards,
} from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { canPerform } from "./permissions.js";
import { GroupsService } from "./groups.service.js";

class CreateGroupBody {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(50)
  maxMembers?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  joinByCodeEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  joinByLinkEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleUseDeadline?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  ruleDefaultDeadlineTime?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleAllowLateSubmission?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleUseAiFeedback?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleAllowEditAfterSubmit?: boolean;

  @IsOptional()
  @IsIn(["OWNER_ONLY", "OWNER_AND_MANAGER"])
  ruleAssignmentCreatorRoles?: string;
}

class PatchGroupBody {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(50)
  maxMembers?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  joinByCodeEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  joinByLinkEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleUseDeadline?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  ruleDefaultDeadlineTime?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleAllowLateSubmission?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleUseAiFeedback?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ruleAllowEditAfterSubmit?: boolean;

  @IsOptional()
  @IsIn(["OWNER_ONLY", "OWNER_AND_MANAGER"])
  ruleAssignmentCreatorRoles?: string;
}

class DeleteGroupBody {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  confirmGroupName!: string;
}

class UpdateRoleBody {
  @IsIn(["MANAGER", "MEMBER"]) role!: "MANAGER" | "MEMBER";
}

@Controller("api/v1/groups")
@Dependencies(GroupsService)
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  async listMine(@CurrentUser() me: { id: string }) {
    return { success: true, data: await this.groups.listMyGroups(me.id) };
  }

  @Post()
  async create(@CurrentUser() me: { id: string }, @Body() body: CreateGroupBody) {
    const g = await this.groups.create(me.id, body);
    return {
      success: true,
      data: {
        id: g.id,
        name: g.name,
        ownerUserId: g.ownerUserId,
        groupCode: g.groupCode,
        maxMembers: g.maxMembers,
        memberCount: g.memberCount,
      },
    };
  }

  @Get(":groupId")
  async get(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_VIEW")) throw new ForbiddenException();
    const g = await this.groups.getById(groupId);
    return {
      success: true,
      data: {
        id: g.id,
        name: g.name,
        description: g.description,
        ownerUserId: g.ownerUserId,
        myRole: role,
        groupCode: g.groupCode,
        maxMembers: g.maxMembers,
        memberCount: g.memberCount,
        joinMethods: {
          code: g.joinByCodeEnabled,
          link: g.joinByLinkEnabled,
        },
        rules: {
          useDeadline: g.ruleUseDeadline,
          defaultDeadlineTime: g.ruleDefaultDeadlineTime,
          allowLateSubmission: g.ruleAllowLateSubmission,
          useAiFeedback: g.ruleUseAiFeedback,
          allowEditAfterSubmit: g.ruleAllowEditAfterSubmit,
          assignmentCreatorRoles: g.ruleAssignmentCreatorRoles,
        },
      },
    };
  }

  @Post(":groupId/code/regenerate")
  @HttpCode(200)
  async regenerateCode(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_INVITE_CODE_REGEN")) throw new ForbiddenException();
    const data = await this.groups.regenerateGroupCode(groupId);
    return { success: true, data };
  }

  @Patch(":groupId")
  async update(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Body() body: PatchGroupBody,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_UPDATE")) throw new ForbiddenException();
    const g = await this.groups.updateGroup(groupId, body);
    return {
      success: true,
      data: {
        id: g.id,
        name: g.name,
        description: g.description,
        maxMembers: g.maxMembers,
        memberCount: g.memberCount,
        joinMethods: {
          code: g.joinByCodeEnabled,
          link: g.joinByLinkEnabled,
        },
        rules: {
          useDeadline: g.ruleUseDeadline,
          defaultDeadlineTime: g.ruleDefaultDeadlineTime,
          allowLateSubmission: g.ruleAllowLateSubmission,
          useAiFeedback: g.ruleUseAiFeedback,
          allowEditAfterSubmit: g.ruleAllowEditAfterSubmit,
          assignmentCreatorRoles: g.ruleAssignmentCreatorRoles,
        },
      },
    };
  }

  @Delete(":groupId")
  async delete(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Body() body: DeleteGroupBody,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_DELETE")) throw new ForbiddenException();
    return { success: true, data: await this.groups.deleteWithCascade(groupId, body.confirmGroupName) };
  }

  @Get(":groupId/members")
  async listMembers(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_MEMBER_LIST")) throw new ForbiddenException();
    return { success: true, data: await this.groups.listMembers(groupId) };
  }

  @Patch(":groupId/members/:userId/role")
  async updateMemberRole(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
    @Body() body: UpdateRoleBody,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_MEMBER_ROLE_CHANGE")) throw new ForbiddenException();
    await this.groups.setMemberRole(groupId, userId, body.role);
    return { success: true, data: { ok: true } };
  }

  @Post(":groupId/transfer/:userId")
  @HttpCode(200)
  async transferOwner(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_OWNER_TRANSFER")) throw new ForbiddenException();
    await this.groups.transferOwnership(groupId, me.id, userId);
    return { success: true, data: { ok: true } };
  }

  @Delete(":groupId/members/me")
  async leave(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    await this.groups.leaveSelf(groupId, me.id);
    return { success: true, data: { ok: true } };
  }

  @Delete(":groupId/members/:userId")
  async removeMember(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_MEMBER_KICK")) throw new ForbiddenException();
    await this.groups.removeMember(groupId, userId);
    return { success: true, data: { ok: true } };
  }
}
