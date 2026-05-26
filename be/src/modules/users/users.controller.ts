// 내 사용자 정보 조회/수정/탈퇴 컨트롤러입니다.
import {
  Body,
  Controller,
  Delete,
  Dependencies,
  Get,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Transform, Type } from "class-transformer";
import { clearSessionCookie } from "../auth/auth-cookie.js";
import { CurrentSessionId, CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SessionService } from "../auth/session/session.service.js";
import { UsersService } from "./users.service.js";

class UpdateNicknameRequest {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  nickname!: string;
}

class ListMeNotificationsQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 5;
}

class ListMeSubmissionQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
  @IsOptional()
  @IsIn(["createdAtAsc", "createdAtDesc"])
  sort?: "createdAtAsc" | "createdAtDesc";
  /** ISO 8601. 지정 시 해당 시각 이후 생성된 제출만 포함합니다. */
  @IsOptional()
  @IsDateString()
  createdAfter?: string;
}

@Controller("api/v1/users")
@Dependencies(UsersService, SessionService)
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
  ) {}

  @Get("me")
  async getMe(@CurrentUser() me: { id: string }) {
    const user = await this.usersService.getById(me.id);
    return {
      success: true,
      data: {
        id: user.id,
        provider: user.provider,
        email: user.email,
        nickname: user.nickname,
        profileImageUrl: user.profileImageUrl,
      },
    };
  }

  @Get("me/notifications")
  async getRecentNotifications(@CurrentUser() me: { id: string }, @Query() query: ListMeNotificationsQuery) {
    return {
      success: true,
      data: await this.usersService.listRecentNotifications(me.id, query.limit),
    };
  }

  @Get("me/notifications/unread-count")
  async getUnreadNotificationCount(@CurrentUser() me: { id: string }) {
    return {
      success: true,
      data: { count: await this.usersService.countUnreadNotifications(me.id) },
    };
  }

  @Patch("me/notifications/read-all")
  async markAllNotificationsRead(@CurrentUser() me: { id: string }) {
    await this.usersService.markAllNotificationsRead(me.id);
    return { success: true, data: { ok: true } };
  }

  @Delete("me/notifications")
  async deleteAllNotifications(@CurrentUser() me: { id: string }) {
    await this.usersService.deleteAllNotifications(me.id);
    return { success: true, data: { ok: true } };
  }

  @Delete("me/notifications/:notificationId")
  async deleteNotification(
    @CurrentUser() me: { id: string },
    @Param("notificationId") notificationId: string,
  ) {
    await this.usersService.deleteNotification(me.id, notificationId);
    return { success: true, data: { ok: true } };
  }

  @Get("me/submissions")
  async getRecentSubmissions(@CurrentUser() me: { id: string }, @Query() query: ListMeSubmissionQuery) {
    return {
      success: true,
      data: await this.usersService.listRecentSubmissions(me.id, query),
    };
  }

  @Patch("me")
  async patchMe(@CurrentUser() me: { id: string }, @Body() body: UpdateNicknameRequest) {
    const updated = await this.usersService.updateNickname(me.id, body.nickname);
    return {
      success: true,
      data: {
        id: updated.id,
        provider: updated.provider,
        email: updated.email,
        nickname: updated.nickname,
        profileImageUrl: updated.profileImageUrl,
      },
    };
  }

  @Delete("me")
  async deleteMe(
    @CurrentUser() me: { id: string },
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.usersService.softDelete(me.id);
    await this.sessionService.destroyAllForUser(me.id);
    clearSessionCookie(res);
    return { success: true, data: { ok: true } };
  }
}
