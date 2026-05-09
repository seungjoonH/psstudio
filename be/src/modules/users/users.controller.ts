// 내 사용자 정보 조회/수정/탈퇴 컨트롤러입니다.
import { Body, Controller, Delete, Dependencies, Get, Patch, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Transform, Type } from "class-transformer";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import { IsNull } from "typeorm";
import { clearSessionCookie } from "../auth/auth-cookie.js";
import { CurrentSessionId, CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SessionService } from "../auth/session/session.service.js";
import { dataSource } from "../../config/data-source.js";
import { Assignment } from "../assignments/assignment.entity.js";
import { Notification } from "../notifications/notification.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { UsersService } from "./users.service.js";

class UpdateNicknameRequest {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  nickname!: string;
}

class ListMeRecentQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}

class ListMeSubmissionQuery extends ListMeRecentQuery {
  @IsOptional()
  @IsIn(["createdAtAsc", "createdAtDesc"])
  sort?: "createdAtAsc" | "createdAtDesc";
}

function resolveNotificationTitle(type: string, payload: Record<string, unknown>): string {
  const candidates = [payload.title, payload.message, payload.text, payload.body];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      let title = candidate.trim();
      if (type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION) {
        title = title.replace(/코드 리뷰를 남겼습니다/g, "댓글을 남겼습니다");
      }
      return title;
    }
  }
  return type;
}

function pickStr(p: Record<string, unknown>, key: string): string | undefined {
  const v = p[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function pickInt(p: Record<string, unknown>, key: string): number | undefined {
  const v = p[key];
  if (typeof v === "number" && Number.isInteger(v)) return v;
  return undefined;
}

/** 알림 payload의 식별자로 이동할 FE 경로를 만듭니다. */
function resolveNotificationHref(type: string, payload: Record<string, unknown>): string | null {
  const groupId = pickStr(payload, "groupId");
  const assignmentId = pickStr(payload, "assignmentId");
  const submissionId = pickStr(payload, "submissionId");
  const versionNo = pickInt(payload, "versionNo");

  if (type === NOTIFICATION_TYPES.ASSIGNMENT_CREATED && groupId !== undefined && assignmentId !== undefined) {
    return `/groups/${groupId}/assignments/${assignmentId}`;
  }

  const submissionHref =
    groupId !== undefined && assignmentId !== undefined && submissionId !== undefined
      ? `/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`
      : null;

  if (
    type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION ||
    type === NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW ||
    type === NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE
  ) {
    if (
      groupId !== undefined &&
      assignmentId !== undefined &&
      submissionId !== undefined &&
      versionNo !== undefined &&
      versionNo >= 1
    ) {
      const from = Math.max(0, versionNo - 1);
      return `/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}/diff?from=${from}&to=${versionNo}`;
    }
    return submissionHref;
  }

  if (
    type === NOTIFICATION_TYPES.COMMENT_ON_MY_SUBMISSION ||
    type === NOTIFICATION_TYPES.REPLY_ON_MY_COMMENT
  ) {
    return submissionHref;
  }

  return null;
}

function resolveNotificationActor(payload: Record<string, unknown>): {
  actorNickname: string | null;
  actorProfileImageUrl: string | null;
} {
  const nick = pickStr(payload, "actorNickname");
  const url = pickStr(payload, "actorProfileImageUrl");
  return {
    actorNickname: nick ?? null,
    actorProfileImageUrl: url ?? null,
  };
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
  async getRecentNotifications(@CurrentUser() me: { id: string }, @Query() query: ListMeRecentQuery) {
    await this.usersService.ensureInitialized();
    const rows = await dataSource.getRepository(Notification).find({
      where: { recipientUserId: me.id, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
      take: query.limit,
    });
    return {
      success: true,
      data: rows.map((row) => {
        const payload = row.payload as Record<string, unknown>;
        const actor = resolveNotificationActor(payload);
        return {
          id: row.id,
          title: resolveNotificationTitle(row.type, payload),
          createdAt: row.createdAt.toISOString(),
          href: resolveNotificationHref(row.type, payload),
          actorNickname: actor.actorNickname,
          actorProfileImageUrl: actor.actorProfileImageUrl,
        };
      }),
    };
  }

  @Get("me/submissions")
  async getRecentSubmissions(@CurrentUser() me: { id: string }, @Query() query: ListMeSubmissionQuery) {
    await this.usersService.ensureInitialized();
    const sortDirection = query.sort === "createdAtAsc" ? "ASC" : "DESC";
    const rows = await dataSource
      .getRepository(Submission)
      .createQueryBuilder("s")
      .innerJoin(Assignment, "a", "a.id = s.assignment_id")
      .where("s.author_user_id = :userId", { userId: me.id })
      .andWhere("s.deleted_at IS NULL")
      .andWhere("a.deleted_at IS NULL")
      .orderBy("s.created_at", sortDirection)
      .select([
        "s.id AS id",
        "s.title AS title",
        "s.language AS language",
        "s.created_at AS created_at",
        "s.assignment_id AS assignment_id",
        "a.group_id AS group_id",
      ])
      .limit(query.limit)
      .getRawMany<{
        id: string;
        title: string;
        language: string;
        created_at: Date;
        assignment_id: string;
        group_id: string;
      }>();
    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        language: row.language,
        createdAt: new Date(row.created_at).toISOString(),
        href: `/groups/${row.group_id}/assignments/${row.assignment_id}/submissions/${row.id}`,
      })),
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
