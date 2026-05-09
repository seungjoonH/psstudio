// 내 사용자 정보 조회/수정/탈퇴 컨트롤러입니다.
import { Body, Controller, Delete, Dependencies, Get, Patch, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Transform, Type } from "class-transformer";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import { In, IsNull } from "typeorm";
import { clearSessionCookie } from "../auth/auth-cookie.js";
import { CurrentSessionId, CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { SessionService } from "../auth/session/session.service.js";
import { dataSource } from "../../config/data-source.js";
import { Assignment } from "../assignments/assignment.entity.js";
import { Notification } from "../notifications/notification.entity.js";
import { Review } from "../reviews/review.entity.js";
import { ReviewReply } from "../reviews/review-reply.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { User } from "./user.entity.js";
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

/** 제목이 `OOO님이 …` 형태일 때 행위자 표시용 이름을 뽑습니다. */
function parseActorNameFromNotificationTitle(title: string): string | null {
  const m = /^(.+?)님이/.exec(title.trim());
  if (m === null || m[1] === undefined) return null;
  const name = m[1].trim();
  return name.length > 0 ? name : null;
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
    const actorIds = new Set<string>();
    const reviewIdsForAuthor = new Set<string>();
    const replyIdsForAuthor = new Set<string>();
    for (const row of rows) {
      const payload = row.payload as Record<string, unknown>;
      const fromPayload = pickStr(payload, "actorUserId");
      if (fromPayload !== undefined) {
        actorIds.add(fromPayload);
      } else if (row.type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION) {
        const rid = pickStr(payload, "reviewId");
        if (rid !== undefined) reviewIdsForAuthor.add(rid);
      } else if (
        row.type === NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW ||
        row.type === NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE
      ) {
        const replyId = pickStr(payload, "replyId");
        if (replyId !== undefined) replyIdsForAuthor.add(replyId);
      }
    }
    const reviewAuthorByReviewId = new Map<string, string>();
    if (reviewIdsForAuthor.size > 0) {
      const revs = await dataSource.getRepository(Review).find({
        where: { id: In([...reviewIdsForAuthor]) },
      });
      for (const r of revs) {
        reviewAuthorByReviewId.set(r.id, r.authorUserId);
        actorIds.add(r.authorUserId);
      }
    }
    const replyAuthorByReplyId = new Map<string, string>();
    if (replyIdsForAuthor.size > 0) {
      const reps = await dataSource.getRepository(ReviewReply).find({
        where: { id: In([...replyIdsForAuthor]) },
      });
      for (const rep of reps) {
        replyAuthorByReplyId.set(rep.id, rep.authorUserId);
        actorIds.add(rep.authorUserId);
      }
    }
    const actorUsers =
      actorIds.size === 0
        ? []
        : await dataSource.getRepository(User).find({
            where: { id: In([...actorIds]) },
            withDeleted: true,
          });
    const actorUserMap = new Map(actorUsers.map((u) => [u.id, u]));
    return {
      success: true,
      data: rows.map((row) => {
        const payload = row.payload as Record<string, unknown>;
        const fromPayload = resolveNotificationActor(payload);
        let actorNickname = fromPayload.actorNickname;
        let actorProfileImageUrl = fromPayload.actorProfileImageUrl;
        let actorUserId = pickStr(payload, "actorUserId");
        if (actorUserId === undefined && row.type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION) {
          const rid = pickStr(payload, "reviewId");
          if (rid !== undefined) {
            const uid = reviewAuthorByReviewId.get(rid);
            if (uid !== undefined) actorUserId = uid;
          }
        }
        if (
          actorUserId === undefined &&
          (row.type === NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW ||
            row.type === NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE)
        ) {
          const replyId = pickStr(payload, "replyId");
          if (replyId !== undefined) {
            const uid = replyAuthorByReplyId.get(replyId);
            if (uid !== undefined) actorUserId = uid;
          }
        }
        if (actorUserId !== undefined) {
          const u = actorUserMap.get(actorUserId);
          if (u !== undefined) {
            if (actorNickname === null && u.nickname.trim().length > 0) {
              actorNickname = u.nickname.trim();
            }
            if (actorProfileImageUrl === null && u.profileImageUrl.trim().length > 0) {
              actorProfileImageUrl = u.profileImageUrl.trim();
            }
          }
        }
        const title = resolveNotificationTitle(row.type, payload);
        if (actorNickname === null) {
          const parsed = parseActorNameFromNotificationTitle(title);
          if (parsed !== null) actorNickname = parsed;
        }
        return {
          id: row.id,
          title,
          createdAt: row.createdAt.toISOString(),
          href: resolveNotificationHref(row.type, payload),
          actorNickname,
          actorProfileImageUrl,
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
