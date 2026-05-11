// 댓글류 도메인의 이모지 반응을 처리하는 서비스입니다.
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
import { Comment } from "../comments/comment.entity.js";
import { GroupsService } from "../groups/groups.service.js";
import { Notification } from "../notifications/notification.entity.js";
import { Review } from "../reviews/review.entity.js";
import { ReviewReply } from "../reviews/review-reply.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { SubmissionVersion } from "../submissions/submission-version.entity.js";
import { User } from "../users/user.entity.js";
import { Reaction, type ReactionTargetType } from "./reaction.entity.js";

const TARGET_TYPES: ReactionTargetType[] = [
  "review",
  "review_reply",
  "comment",
  "post_comment",
];

const EMOJI_MIN_LENGTH = 1;
const EMOJI_MAX_LENGTH = 64;

export type ReactionSummaryItem = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
};

@Injectable()
@Dependencies(GroupsService)
export class ReactionsService {
  constructor(private readonly groups: GroupsService) {}

  private get ds(): DataSource {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  validateTargetType(value: string): ReactionTargetType {
    if (!TARGET_TYPES.includes(value as ReactionTargetType)) {
      throw new BadRequestException("지원하지 않는 reaction 대상입니다.");
    }
    return value as ReactionTargetType;
  }

  validateEmoji(emoji: string): string {
    const trimmed = emoji.trim();
    if (trimmed.length < EMOJI_MIN_LENGTH || trimmed.length > EMOJI_MAX_LENGTH) {
      throw new BadRequestException("이모지 길이가 올바르지 않습니다.");
    }
    return trimmed;
  }

  private async maybeNotifyReviewThreadReaction(
    targetType: ReactionTargetType,
    targetId: string,
    actorUserId: string,
    cleanEmoji: string,
  ): Promise<void> {
    if (targetType !== "review" && targetType !== "review_reply") return;

    const reviewRepo = this.ds.getRepository(Review);
    const replyRepo = this.ds.getRepository(ReviewReply);
    const userRepo = this.ds.getRepository(User);
    const submissionRepo = this.ds.getRepository(Submission);
    const versionRepo = this.ds.getRepository(SubmissionVersion);
    const notifRepo = this.ds.getRepository(Notification);

    let review: Review | null = null;
    let contentOwnerUserId: string | null = null;

    if (targetType === "review") {
      review = await reviewRepo.findOne({ where: { id: targetId } });
      if (review === null) return;
      contentOwnerUserId = review.authorUserId;
    } else {
      const reply = await replyRepo.findOne({ where: { id: targetId } });
      if (reply === null) return;
      review = await reviewRepo.findOne({ where: { id: reply.reviewId } });
      if (review === null) return;
      contentOwnerUserId = reply.authorUserId;
    }

    if (contentOwnerUserId === null) return;

    const submission = await submissionRepo.findOne({ where: { id: review.submissionId } });
    const versionRow = await versionRepo.findOne({ where: { id: review.submissionVersionId } });
    const versionNo = versionRow?.versionNo ?? 1;

    const actor = await userRepo.findOne({ where: { id: actorUserId }, withDeleted: true });
    const authorNickname = actor?.nickname ?? "탈퇴한 사용자";

    const ownerUser = await userRepo.findOne({ where: { id: contentOwnerUserId }, withDeleted: true });
    let recipientUserId = contentOwnerUserId;
    if (ownerUser?.isSystemBot === true) {
      if (submission !== null && submission.deletedAt === null) {
        recipientUserId = submission.authorUserId;
      } else {
        return;
      }
    }

    if (recipientUserId === actorUserId) return;

    const title = `${authorNickname}님이 나의 리뷰 스레드에 ${cleanEmoji} 이모지를 눌렀습니다.`;
    await notifRepo.save(
      notifRepo.create({
        recipientUserId,
        type: NOTIFICATION_TYPES.REACTION_ON_MY_REVIEW_THREAD,
        payload: {
          title,
          submissionId: review.submissionId,
          assignmentId: review.assignmentId,
          groupId: review.groupId,
          reviewId: review.id,
          versionNo,
          emoji: cleanEmoji,
          actorUserId,
          actorNickname: authorNickname,
          actorProfileImageUrl: actor?.profileImageUrl ?? "",
        },
      }),
    );
  }

  async ensureMembershipForTarget(
    targetType: ReactionTargetType,
    targetId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureInitialized();
    if (targetType === "review") {
      const review = await this.ds.getRepository(Review).findOne({ where: { id: targetId } });
      if (review === null) throw new NotFoundException("리뷰를 찾을 수 없습니다.");
      await this.groups.requireRole(review.groupId, userId);
      return;
    }
    if (targetType === "review_reply") {
      const reply = await this.ds.getRepository(ReviewReply).findOne({ where: { id: targetId } });
      if (reply === null) throw new NotFoundException("답글을 찾을 수 없습니다.");
      const review = await this.ds.getRepository(Review).findOne({ where: { id: reply.reviewId } });
      if (review === null) throw new NotFoundException("부모 리뷰를 찾을 수 없습니다.");
      await this.groups.requireRole(review.groupId, userId);
      return;
    }
    if (targetType === "comment") {
      const comment = await this.ds.getRepository(Comment).findOne({ where: { id: targetId } });
      if (comment === null) throw new NotFoundException("댓글을 찾을 수 없습니다.");
      await this.groups.requireRole(comment.groupId, userId);
      return;
    }
    throw new ForbiddenException("이 대상에 대한 reaction은 아직 지원되지 않습니다.");
  }

  async add(
    targetType: ReactionTargetType,
    targetId: string,
    userId: string,
    emoji: string,
  ): Promise<Reaction> {
    await this.ensureMembershipForTarget(targetType, targetId, userId);
    const cleanEmoji = this.validateEmoji(emoji);
    const repo = this.ds.getRepository(Reaction);
    const existing = await repo.findOne({
      where: { targetType, targetId, userId, emoji: cleanEmoji },
    });
    if (existing !== null) return existing;
    const created = repo.create({ targetType, targetId, userId, emoji: cleanEmoji });
    const saved = await repo.save(created);
    await this.maybeNotifyReviewThreadReaction(targetType, targetId, userId, cleanEmoji);
    return saved;
  }

  async remove(
    targetType: ReactionTargetType,
    targetId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    await this.ensureMembershipForTarget(targetType, targetId, userId);
    const cleanEmoji = this.validateEmoji(emoji);
    await this.ds.getRepository(Reaction).delete({
      targetType,
      targetId,
      userId,
      emoji: cleanEmoji,
    });
  }

  async summarizeMany(
    targetType: ReactionTargetType,
    targetIds: string[],
    viewerUserId: string,
  ): Promise<Map<string, ReactionSummaryItem[]>> {
    await this.ensureInitialized();
    const result = new Map<string, ReactionSummaryItem[]>();
    if (targetIds.length === 0) return result;
    const rows = await this.ds.getRepository(Reaction).find({
      where: { targetType, targetId: In(targetIds) },
      order: { createdAt: "ASC" },
    });
    const grouped = new Map<string, Map<string, { userIds: string[]; reactedByMe: boolean }>>();
    for (const row of rows) {
      const byTarget = grouped.get(row.targetId) ?? new Map();
      const byEmoji = byTarget.get(row.emoji) ?? { userIds: [], reactedByMe: false };
      byEmoji.userIds.push(row.userId);
      if (row.userId === viewerUserId) byEmoji.reactedByMe = true;
      byTarget.set(row.emoji, byEmoji);
      grouped.set(row.targetId, byTarget);
    }
    for (const targetId of targetIds) {
      const byEmoji = grouped.get(targetId);
      if (byEmoji === undefined) {
        result.set(targetId, []);
        continue;
      }
      const summary: ReactionSummaryItem[] = [];
      for (const [emoji, info] of byEmoji.entries()) {
        summary.push({
          emoji,
          count: info.userIds.length,
          reactedByMe: info.reactedByMe,
          userIds: info.userIds,
        });
      }
      result.set(targetId, summary);
    }
    return result;
  }

  async deleteByTargets(
    targetType: ReactionTargetType,
    targetIds: string[],
  ): Promise<void> {
    if (targetIds.length === 0) return;
    await this.ensureInitialized();
    await this.ds.getRepository(Reaction).delete({
      targetType,
      targetId: In(targetIds),
    });
  }
}
