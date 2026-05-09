// 코드 리뷰 답글을 다루는 서비스입니다.
import {
  BadRequestException,
  Dependencies,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NOTIFICATION_TYPES } from "@psstudio/shared";
import { In, type DataSource } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { GroupsService } from "../groups/groups.service.js";
import { canPerform } from "../groups/permissions.js";
import { Notification } from "../notifications/notification.entity.js";
import { ReactionsService } from "../reactions/reactions.service.js";
import { Submission } from "../submissions/submission.entity.js";
import { User } from "../users/user.entity.js";
import { Review } from "./review.entity.js";
import { ReviewReply } from "./review-reply.entity.js";

export type ReviewReplyItem = {
  id: string;
  reviewId: string;
  parentReplyId: string | null;
  authorUserId: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  body: string;
  isAdminHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
  reactions: Array<{
    emoji: string;
    count: number;
    reactedByMe: boolean;
    userIds: string[];
  }>;
};

@Injectable()
@Dependencies(GroupsService, ReactionsService)
export class ReviewsService {
  constructor(
    private readonly groups: GroupsService,
    private readonly reactions: ReactionsService,
  ) {}

  private get ds(): DataSource {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  async listRepliesForReviewIds(
    reviewIds: string[],
    viewerUserId: string,
  ): Promise<Map<string, ReviewReplyItem[]>> {
    const result = new Map<string, ReviewReplyItem[]>();
    if (reviewIds.length === 0) return result;
    await this.ensureInitialized();
    const replies = await this.ds.getRepository(ReviewReply).find({
      where: { reviewId: In(reviewIds) },
      order: { createdAt: "ASC" },
    });
    if (replies.length === 0) {
      for (const id of reviewIds) result.set(id, []);
      return result;
    }
    const userIds = [...new Set(replies.map((reply) => reply.authorUserId))];
    const users = await this.ds.getRepository(User).find({
      where: { id: In(userIds) },
      withDeleted: true,
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const replyIds = replies.map((reply) => reply.id);
    const reactionMap = await this.reactions.summarizeMany(
      "review_reply",
      replyIds,
      viewerUserId,
    );
    for (const id of reviewIds) result.set(id, []);
    for (const reply of replies) {
      const list = result.get(reply.reviewId) ?? [];
      list.push({
        id: reply.id,
        reviewId: reply.reviewId,
        parentReplyId: reply.parentReplyId,
        authorUserId: reply.authorUserId,
        authorNickname: userMap.get(reply.authorUserId)?.nickname ?? "탈퇴한 사용자",
        authorProfileImageUrl: userMap.get(reply.authorUserId)?.profileImageUrl ?? "",
        body: reply.isAdminHidden ? "삭제된 댓글입니다" : reply.body,
        isAdminHidden: reply.isAdminHidden,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        reactions: reactionMap.get(reply.id) ?? [],
      });
      result.set(reply.reviewId, list);
    }
    return result;
  }

  async listReplies(reviewId: string, viewerUserId: string): Promise<ReviewReplyItem[]> {
    await this.ensureInitialized();
    const review = await this.ds.getRepository(Review).findOne({ where: { id: reviewId } });
    if (review === null) throw new NotFoundException("리뷰를 찾을 수 없습니다.");
    await this.groups.requireRole(review.groupId, viewerUserId);
    const map = await this.listRepliesForReviewIds([reviewId], viewerUserId);
    return map.get(reviewId) ?? [];
  }

  async createReply(
    reviewId: string,
    authorUserId: string,
    body: string,
  ): Promise<ReviewReplyItem> {
    await this.ensureInitialized();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException("답글 내용을 입력해주세요.");
    }
    const review = await this.ds.getRepository(Review).findOne({ where: { id: reviewId } });
    if (review === null) throw new NotFoundException("리뷰를 찾을 수 없습니다.");
    await this.groups.requireRole(review.groupId, authorUserId);
    const reply = await this.ds.getRepository(ReviewReply).save(
      this.ds.getRepository(ReviewReply).create({
        reviewId,
        parentReplyId: null,
        authorUserId,
        body: trimmed,
      }),
    );
    const user = await this.ds
      .getRepository(User)
      .findOne({ where: { id: authorUserId }, withDeleted: true });
    const authorNickname = user?.nickname ?? "탈퇴한 사용자";
    const reviewAuthor = await this.ds
      .getRepository(User)
      .findOne({ where: { id: review.authorUserId }, withDeleted: true });
    const skipReviewAuthorNotif = reviewAuthor?.isSystemBot === true;
    const submission = await this.ds
      .getRepository(Submission)
      .findOne({ where: { id: review.submissionId } });
    const notifRepo = this.ds.getRepository(Notification);
    const basePayload = {
      submissionId: review.submissionId,
      assignmentId: review.assignmentId,
      groupId: review.groupId,
      reviewId: review.id,
      replyId: reply.id,
    };
    if (!skipReviewAuthorNotif && review.authorUserId !== authorUserId) {
      await notifRepo.save(
        notifRepo.create({
          recipientUserId: review.authorUserId,
          type: NOTIFICATION_TYPES.REPLY_ON_MY_REVIEW,
          payload: {
            title: `${authorNickname}님이 내 리뷰에 답글을 남겼습니다.`,
            ...basePayload,
          },
        }),
      );
    }
    if (
      submission !== null &&
      submission.deletedAt === null &&
      submission.authorUserId !== authorUserId &&
      submission.authorUserId !== review.authorUserId
    ) {
      await notifRepo.save(
        notifRepo.create({
          recipientUserId: submission.authorUserId,
          type: NOTIFICATION_TYPES.REPLY_ON_REVIEW_I_WROTE,
          payload: {
            title: `${authorNickname}님이 내 제출의 리뷰 스레드에 답글을 남겼습니다.`,
            ...basePayload,
          },
        }),
      );
    }
    return {
      id: reply.id,
      reviewId: reply.reviewId,
      parentReplyId: null,
      authorUserId,
      authorNickname,
      authorProfileImageUrl: user?.profileImageUrl ?? "",
      body: reply.body,
      isAdminHidden: false,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
      reactions: [],
    };
  }

  async deleteReply(replyId: string, requesterId: string): Promise<void> {
    await this.ensureInitialized();
    const reply = await this.ds.getRepository(ReviewReply).findOne({ where: { id: replyId } });
    if (reply === null) throw new NotFoundException("답글을 찾을 수 없습니다.");
    const review = await this.ds.getRepository(Review).findOne({ where: { id: reply.reviewId } });
    if (review === null) throw new NotFoundException("부모 리뷰를 찾을 수 없습니다.");
    const role = await this.groups.requireRole(review.groupId, requesterId);
    const isOwnerOrManager = canPerform(role, "REVIEW_HIDE_ANY");
    if (reply.authorUserId === requesterId) {
      await this.ds.getRepository(ReviewReply).delete({ id: replyId });
      await this.reactions.deleteByTargets("review_reply", [replyId]);
      return;
    }
    if (!isOwnerOrManager) {
      throw new ForbiddenException("답글을 삭제할 권한이 없습니다.");
    }
    reply.isAdminHidden = true;
    await this.ds.getRepository(ReviewReply).save(reply);
  }
}
