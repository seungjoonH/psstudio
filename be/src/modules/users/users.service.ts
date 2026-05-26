// DB 기반 사용자 upsert/조회 서비스입니다.
import { Injectable, NotFoundException } from "@nestjs/common";
import { NOTIFICATION_TYPES, type OAuthProvider } from "@psstudio/shared";
import { In, IsNull } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { Assignment } from "../assignments/assignment.entity.js";
import { Notification } from "../notifications/notification.entity.js";
import { Review } from "../reviews/review.entity.js";
import { ReviewReply } from "../reviews/review-reply.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { User } from "./user.entity.js";

type UpsertPayload = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  displayName: string;
  profileImageUrl: string;
};

export type MeNotificationListItem = {
  id: string;
  type: string;
  title: string;
  isRead: boolean;
  createdAt: string;
  href: string | null;
  actorNickname: string | null;
  actorProfileImageUrl: string | null;
};

export type MeSubmissionListItem = {
  id: string;
  title: string;
  assignmentTitle: string;
  language: string;
  createdAt: string;
  href: string;
};

const LEGACY_REVIEW_REPLY_THREAD_TITLE_KO = "코드 리뷰 스레드에 답글이 달렸습니다.";

function formatReviewReplyThreadTitleKo(actorNickname: string): string {
  return `${actorNickname}님이 리뷰 스레드에 답글을 달았습니다.`;
}

function formatDeadlineSoonTitleKo(leadTimeMinutes?: number): string {
  if (leadTimeMinutes === 60) return "과제 마감까지 1시간 남았습니다.";
  if (leadTimeMinutes === 1440) return "과제 마감까지 24시간 남았습니다.";
  return "과제 마감이 다가오고 있습니다.";
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

function resolveNotificationTitle(type: string, payload: Record<string, unknown>): string {
  const candidates = [payload.title, payload.message, payload.text, payload.body];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
    let title = candidate.trim();
    if (type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION) {
      title = title.replace(/코드 리뷰를 남겼습니다/g, "댓글을 남겼습니다");
    }
    return title;
  }
  if (type === NOTIFICATION_TYPES.DEADLINE_SOON) {
    return formatDeadlineSoonTitleKo(pickInt(payload, "leadTimeMinutes"));
  }
  return type;
}

function resolveNotificationHref(type: string, payload: Record<string, unknown>): string | null {
  const groupId = pickStr(payload, "groupId");
  const assignmentId = pickStr(payload, "assignmentId");
  const submissionId = pickStr(payload, "submissionId");
  const versionNo = pickInt(payload, "versionNo");

  if (
    (type === NOTIFICATION_TYPES.ASSIGNMENT_CREATED || type === NOTIFICATION_TYPES.DEADLINE_SOON) &&
    groupId !== undefined &&
    assignmentId !== undefined
  ) {
    return `/groups/${groupId}/assignments/${assignmentId}`;
  }

  const submissionHref =
    groupId !== undefined && assignmentId !== undefined && submissionId !== undefined
      ? `/groups/${groupId}/assignments/${assignmentId}/submissions/${submissionId}`
      : null;

  if (
    type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION ||
    type === NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW ||
    type === NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE ||
    type === NOTIFICATION_TYPES.REACTION_ON_MY_REVIEW_THREAD
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
  const actorNickname = pickStr(payload, "actorNickname");
  const actorProfileImageUrl = pickStr(payload, "actorProfileImageUrl");
  return {
    actorNickname: actorNickname ?? null,
    actorProfileImageUrl: actorProfileImageUrl ?? null,
  };
}

function parseActorNameFromNotificationTitle(title: string): string | null {
  const m = /^(.+?)님이/.exec(title.trim());
  if (m === null || m[1] === undefined) return null;
  const name = m[1].trim();
  return name.length > 0 ? name : null;
}

@Injectable()
export class UsersService {
  async ensureInitialized(): Promise<void> {
    if (!dataSource.isInitialized) await dataSource.initialize();
  }

  async upsertByProviderIdentity(payload: UpsertPayload): Promise<User> {
    await this.ensureInitialized();
    const repo = dataSource.getRepository(User);

    const existing = await repo.findOne({
      where: { provider: payload.provider, providerUserId: payload.providerUserId },
      withDeleted: true,
    });
    if (existing !== null) {
      existing.email = payload.email;
      const nextImage = payload.profileImageUrl.trim();
      if (nextImage.length > 0) {
        existing.profileImageUrl = nextImage;
      }
      if (existing.deletedAt !== null) {
        existing.deletedAt = null;
        existing.nickname = payload.displayName;
      }
      return repo.save(existing);
    }
    const created = repo.create({
      provider: payload.provider,
      providerUserId: payload.providerUserId,
      email: payload.email,
      nickname: payload.displayName,
      profileImageUrl: payload.profileImageUrl,
    });
    return repo.save(created);
  }

  async getById(id: string): Promise<User> {
    await this.ensureInitialized();
    const user = await dataSource.getRepository(User).findOne({ where: { id } });
    if (user === null) throw new NotFoundException("사용자를 찾을 수 없습니다.");
    return user;
  }

  async updateNickname(id: string, nickname: string): Promise<User> {
    await this.ensureInitialized();
    const repo = dataSource.getRepository(User);
    const user = await repo.findOne({ where: { id } });
    if (user === null) throw new NotFoundException("사용자를 찾을 수 없습니다.");
    user.nickname = nickname;
    return repo.save(user);
  }

  async softDelete(id: string): Promise<void> {
    await this.ensureInitialized();
    const repo = dataSource.getRepository(User);
    await repo.softDelete({ id });
  }

  async listRecentNotifications(userId: string, limit: number): Promise<MeNotificationListItem[]> {
    await this.ensureInitialized();
    const rows = await dataSource.getRepository(Notification).find({
      where: { recipientUserId: userId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
      take: limit,
    });
    return this.buildMeNotificationListItems(rows);
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    await this.ensureInitialized();
    return dataSource.getRepository(Notification).count({
      where: { recipientUserId: userId, deletedAt: IsNull(), isRead: false },
    });
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.ensureInitialized();
    await dataSource
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: () => "CURRENT_TIMESTAMP" })
      .where("recipient_user_id = :userId", { userId })
      .andWhere("deleted_at IS NULL")
      .andWhere("is_read = false")
      .execute();
  }

  async deleteAllNotifications(userId: string): Promise<void> {
    await this.ensureInitialized();
    await dataSource.getRepository(Notification).softDelete({ recipientUserId: userId });
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    await this.ensureInitialized();
    const result = await dataSource.getRepository(Notification).softDelete({
      id: notificationId,
      recipientUserId: userId,
    });
    if ((result.affected ?? 0) === 0) throw new NotFoundException("알림을 찾을 수 없습니다.");
  }

  async listRecentSubmissions(
    userId: string,
    params: {
      limit: number;
      sort?: "createdAtAsc" | "createdAtDesc";
      createdAfter?: string;
    },
  ): Promise<MeSubmissionListItem[]> {
    await this.ensureInitialized();
    const sortDirection = params.sort === "createdAtAsc" ? "ASC" : "DESC";
    const qb = dataSource
      .getRepository(Submission)
      .createQueryBuilder("s")
      .innerJoin(Assignment, "a", "a.id = s.assignment_id")
      .where("s.author_user_id = :userId", { userId })
      .andWhere("s.deleted_at IS NULL")
      .andWhere("a.deleted_at IS NULL");
    if (params.createdAfter !== undefined && params.createdAfter.trim() !== "") {
      qb.andWhere("s.created_at >= :createdAfter", { createdAfter: new Date(params.createdAfter) });
    }
    const rows = await qb
      .orderBy("s.created_at", sortDirection)
      .select([
        "s.id AS id",
        "s.title AS title",
        "s.language AS language",
        "s.created_at AS created_at",
        "s.assignment_id AS assignment_id",
        "a.group_id AS group_id",
        "a.title AS assignment_title",
      ])
      .limit(params.limit)
      .getRawMany<{
        id: string;
        title: string;
        language: string;
        created_at: Date;
        assignment_id: string;
        group_id: string;
        assignment_title: string;
      }>();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      assignmentTitle: row.assignment_title,
      language: row.language,
      createdAt: new Date(row.created_at).toISOString(),
      href: `/groups/${row.group_id}/assignments/${row.assignment_id}/submissions/${row.id}`,
    }));
  }

  private async buildMeNotificationListItems(rows: Notification[]): Promise<MeNotificationListItem[]> {
    const actorIds = new Set<string>();
    const reviewIdsForAuthor = new Set<string>();
    const replyIdsForAuthor = new Set<string>();
    for (const row of rows) {
      const payload = row.payload as Record<string, unknown>;
      const fromPayload = pickStr(payload, "actorUserId");
      if (fromPayload !== undefined && row.type !== NOTIFICATION_TYPES.ASSIGNMENT_CREATED) {
        actorIds.add(fromPayload);
      } else if (row.type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION) {
        const reviewId = pickStr(payload, "reviewId");
        if (reviewId !== undefined) reviewIdsForAuthor.add(reviewId);
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
      const reviews = await dataSource.getRepository(Review).find({
        where: { id: In([...reviewIdsForAuthor]) },
      });
      for (const review of reviews) {
        reviewAuthorByReviewId.set(review.id, review.authorUserId);
        actorIds.add(review.authorUserId);
      }
    }
    const replyAuthorByReplyId = new Map<string, string>();
    if (replyIdsForAuthor.size > 0) {
      const replies = await dataSource.getRepository(ReviewReply).find({
        where: { id: In([...replyIdsForAuthor]) },
      });
      for (const reply of replies) {
        replyAuthorByReplyId.set(reply.id, reply.authorUserId);
        actorIds.add(reply.authorUserId);
      }
    }
    const actorUsers =
      actorIds.size === 0
        ? []
        : await dataSource.getRepository(User).find({
            where: { id: In([...actorIds]) },
            withDeleted: true,
          });
    const actorUserMap = new Map(actorUsers.map((user) => [user.id, user]));
    return rows.map((row) =>
      this.buildMeNotificationListItem(row, reviewAuthorByReviewId, replyAuthorByReplyId, actorUserMap),
    );
  }

  private buildMeNotificationListItem(
    row: Notification,
    reviewAuthorByReviewId: Map<string, string>,
    replyAuthorByReplyId: Map<string, string>,
    actorUserMap: Map<string, User>,
  ): MeNotificationListItem {
    const payload = row.payload as Record<string, unknown>;
    const resolvedActor = resolveNotificationActor(payload);
    let actorNickname = resolvedActor.actorNickname;
    let actorProfileImageUrl = resolvedActor.actorProfileImageUrl;
    let actorUserId = pickStr(payload, "actorUserId");
    if (actorUserId === undefined && row.type === NOTIFICATION_TYPES.REVIEW_ON_MY_SUBMISSION) {
      const reviewId = pickStr(payload, "reviewId");
      if (reviewId !== undefined) actorUserId = reviewAuthorByReviewId.get(reviewId);
    }
    if (
      actorUserId === undefined &&
      (row.type === NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW ||
        row.type === NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE)
    ) {
      const replyId = pickStr(payload, "replyId");
      if (replyId !== undefined) actorUserId = replyAuthorByReplyId.get(replyId);
    }
    if (actorUserId !== undefined) {
      const user = actorUserMap.get(actorUserId);
      if (user !== undefined) {
        if (actorNickname === null && user.nickname.trim().length > 0) {
          actorNickname = user.nickname.trim();
        }
        actorProfileImageUrl =
          user.profileImageUrl.trim().length > 0 ? user.profileImageUrl.trim() : null;
      }
    }
    let title = resolveNotificationTitle(row.type, payload);
    if (
      actorNickname !== null &&
      (row.type === NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW ||
        row.type === NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE) &&
      title === LEGACY_REVIEW_REPLY_THREAD_TITLE_KO
    ) {
      title = formatReviewReplyThreadTitleKo(actorNickname);
    }
    if (actorNickname === null && row.type !== NOTIFICATION_TYPES.ASSIGNMENT_CREATED) {
      const parsed = parseActorNameFromNotificationTitle(title);
      if (parsed !== null) actorNickname = parsed;
    }
    if (row.type === NOTIFICATION_TYPES.ASSIGNMENT_CREATED) {
      actorNickname = null;
      actorProfileImageUrl = null;
    }
    return {
      id: row.id,
      type: row.type,
      title,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
      href: resolveNotificationHref(row.type, payload),
      actorNickname,
      actorProfileImageUrl,
    };
  }
}
