// 그룹 초대 링크·그룹 코드 API 컨트롤러입니다.
import {
  Body,
  Controller,
  Delete,
  Dependencies,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsString, Length, Matches } from "class-validator";
import { ENV } from "../../config/env.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { GroupsService } from "../groups/groups.service.js";
import { canPerform } from "../groups/permissions.js";
import { InvitesService } from "./invites.service.js";

class JoinByCodeBody {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(8, 8)
  @Matches(/^[A-Za-z0-9]{8}$/)
  code!: string;
}

@Controller()
@Dependencies(InvitesService, GroupsService)
@UseGuards(AuthGuard)
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly groups: GroupsService,
  ) {}

  @Get("api/v1/groups/:groupId/invite-code")
  async getCode(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_INVITE_CREATE")) throw new ForbiddenException();
    return { success: true, data: await this.invites.getGroupCode(groupId) };
  }

  @Get("api/v1/groups/:groupId/invite-links")
  async listLinks(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_INVITE_CREATE")) throw new ForbiddenException();
    const links = await this.invites.listActiveInviteLinks(groupId);
    const base = ENV.fePublicBaseUrl().replace(/\/$/, "");
    return {
      success: true,
      data: links.map((l) => ({
        id: l.id,
        token: l.token,
        url: `${base}/invite/${l.token}`,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  @Post("api/v1/groups/:groupId/invite-links")
  @HttpCode(200)
  async createLink(@CurrentUser() me: { id: string }, @Param("groupId") groupId: string) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_INVITE_CREATE")) throw new ForbiddenException();
    const data = await this.invites.createInviteLink(groupId, me.id);
    return { success: true, data };
  }

  @Delete("api/v1/groups/:groupId/invite-links/:linkId")
  async revokeLink(
    @CurrentUser() me: { id: string },
    @Param("groupId") groupId: string,
    @Param("linkId") linkId: string,
  ) {
    const role = await this.groups.requireRole(groupId, me.id);
    if (!canPerform(role, "GROUP_INVITE_REVOKE")) throw new ForbiddenException();
    await this.invites.revokeInviteLink(groupId, linkId);
    return { success: true, data: { ok: true } };
  }

  @Post("api/v1/invites/code/accept")
  @HttpCode(200)
  async acceptCode(@CurrentUser() me: { id: string }, @Body() body: JoinByCodeBody) {
    return { success: true, data: await this.invites.joinViaCode(body.code, me.id) };
  }

  @Post("api/v1/invites/link/:token/accept")
  @HttpCode(200)
  async acceptLink(@CurrentUser() me: { id: string }, @Param("token") token: string) {
    return { success: true, data: await this.invites.joinViaLink(token, me.id) };
  }
}
