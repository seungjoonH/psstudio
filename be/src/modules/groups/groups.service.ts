// 그룹과 멤버십을 관리하는 서비스입니다.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { GroupRole } from "@psstudio/shared";
import { randomBytes } from "node:crypto";
import { In, IsNull, type DataSource, type EntityManager } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { Announcement } from "../board/announcement.entity.js";
import { CommunityPost } from "../board/community-post.entity.js";
import { PostComment } from "../board/post-comment.entity.js";
import { Comment } from "../comments/comment.entity.js";
import { Assignment } from "../assignments/assignment.entity.js";
import { AssignmentPolicyOverride } from "../assignments/assignment-policy-override.entity.js";
import { ProblemAnalysis } from "../assignments/problem-analysis.entity.js";
import { CalendarEvent } from "../calendar/calendar-event.entity.js";
import { GroupEmailInvite } from "../invites/group-email-invite.entity.js";
import { GroupInviteLink } from "../invites/group-invite-link.entity.js";
import { JoinRequest } from "../invites/join-request.entity.js";
import { Review } from "../reviews/review.entity.js";
import { ReviewReply } from "../reviews/review-reply.entity.js";
import { AiAnalysis } from "../submissions/ai-analysis.entity.js";
import { Submission } from "../submissions/submission.entity.js";
import { SubmissionDiff } from "../submissions/submission-diff.entity.js";
import { SubmissionVersion } from "../submissions/submission-version.entity.js";
import { User } from "../users/user.entity.js";
import { GroupMember } from "./group-member.entity.js";
import { Group } from "./group.entity.js";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 50;

export type CreateGroupInput = {
  name: string;
  description?: string;
  maxMembers?: number;
  joinByCodeEnabled?: boolean;
  joinByLinkEnabled?: boolean;
  ruleUseDeadline?: boolean;
  ruleDefaultDeadlineTime?: string;
  ruleAllowLateSubmission?: boolean;
  ruleUseAiFeedback?: boolean;
  ruleAllowEditAfterSubmit?: boolean;
  ruleAssignmentCreatorRoles?: string;
};

export type UpdateGroupInput = Partial<
  Pick<
    Group,
    | "name"
    | "description"
    | "maxMembers"
    | "joinByCodeEnabled"
    | "joinByLinkEnabled"
    | "ruleUseDeadline"
    | "ruleDefaultDeadlineTime"
    | "ruleAllowLateSubmission"
    | "ruleUseAiFeedback"
    | "ruleAllowEditAfterSubmit"
    | "ruleAssignmentCreatorRoles"
  >
>;

type ListGroupMemberPreview = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
};

type ListGroupItem = {
  id: string;
  name: string;
  description: string;
  maxMembers: number;
  ownerUserId: string;
  myRole: GroupRole;
  memberCount: number;
  memberPreviews: ListGroupMemberPreview[];
  /** 현재 사용자가 아직 제출하지 않은 활성 과제 수 */
  myPendingAssignmentCount: number;
};

const LIST_MEMBER_PREVIEW_LIMIT = 4;

function generateRandomGroupCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function randomInviteLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

@Injectable()
export class GroupsService {
  private get ds(): DataSource {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  async listMyGroups(userId: string): Promise<ListGroupItem[]> {
    await this.ensureInitialized();
    const memberships = await this.ds.getRepository(GroupMember).find({
      where: { userId, leftAt: IsNull() },
    });
    if (memberships.length === 0) return [];
    const groupIds = memberships.map((m) => m.groupId);
    const [groups, previewMemberships] = await Promise.all([
      this.ds.getRepository(Group).find({
        where: { id: In(groupIds), deletedAt: IsNull() },
      }),
      this.ds.getRepository(GroupMember).find({
        where: { groupId: In(groupIds), leftAt: IsNull() },
        order: { joinedAt: "ASC" },
      }),
    ]);

    const previewUserIds = Array.from(new Set(previewMemberships.map((m) => m.userId)));
    const users =
      previewUserIds.length === 0
        ? []
        : await this.ds.getRepository(User).find({
            where: { id: In(previewUserIds) },
            select: ["id", "nickname", "profileImageUrl"],
          });
    const userById = new Map(users.map((u) => [u.id, u]));

    const previewsByGroup = new Map<string, ListGroupMemberPreview[]>();
    for (const m of previewMemberships) {
      const list = previewsByGroup.get(m.groupId) ?? [];
      if (list.length >= LIST_MEMBER_PREVIEW_LIMIT) continue;
      const u = userById.get(m.userId);
      if (u === undefined) continue;
      list.push({
        userId: u.id,
        nickname: u.nickname,
        profileImageUrl: u.profileImageUrl,
      });
      previewsByGroup.set(m.groupId, list);
    }

    let pendingByGroup = new Map<string, number>();
    if (groupIds.length > 0) {
      const pendingRows = await this.ds
        .createQueryBuilder()
        .select("a.group_id", "groupId")
        .addSelect("COUNT(*)", "cnt")
        .from("assignments", "a")
        .where("a.group_id IN (:...gids)", { gids: groupIds })
        .andWhere("a.deleted_at IS NULL")
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.assignment_id = a.id
            AND s.author_user_id = :uid
            AND s.deleted_at IS NULL
          )`,
        )
        .setParameter("uid", userId)
        .groupBy("a.group_id")
        .getRawMany<{ groupId: string; cnt: string }>();

      pendingByGroup = new Map(pendingRows.map((r) => [r.groupId, Number.parseInt(r.cnt, 10)]));
    }

    return groups.map((g) => {
      const m = memberships.find((mm) => mm.groupId === g.id)!;
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        maxMembers: g.maxMembers,
        ownerUserId: g.ownerUserId,
        myRole: m.role as GroupRole,
        memberCount: g.memberCount,
        memberPreviews: previewsByGroup.get(g.id) ?? [],
        myPendingAssignmentCount: pendingByGroup.get(g.id) ?? 0,
      };
    });
  }

  private async generateUniqueGroupCode(tx: EntityManager): Promise<string> {
    const repo = tx.getRepository(Group);
    for (let i = 0; i < 30; i += 1) {
      const code = generateRandomGroupCode();
      const dup = await repo.findOne({ where: { groupCode: code } });
      if (dup === null) return code;
    }
    throw new ConflictException("그룹 코드 생성에 실패했습니다.");
  }

  async create(userId: string, input: CreateGroupInput): Promise<Group> {
    await this.ensureInitialized();
    let maxMembers = input.maxMembers ?? MIN_MEMBERS;
    if (maxMembers < MIN_MEMBERS) maxMembers = MIN_MEMBERS;
    if (maxMembers > MAX_MEMBERS) maxMembers = MAX_MEMBERS;

    return this.ds.transaction(async (tx) => {
      const groupRepo = tx.getRepository(Group);
      const memberRepo = tx.getRepository(GroupMember);
      const linkRepo = tx.getRepository(GroupInviteLink);

      const groupCode = await this.generateUniqueGroupCode(tx);
      const created = await groupRepo.save(
        groupRepo.create({
          name: input.name,
          description: input.description ?? "",
          ownerUserId: userId,
          maxMembers,
          groupCode,
          joinByCodeEnabled: input.joinByCodeEnabled ?? true,
          joinByLinkEnabled: input.joinByLinkEnabled ?? true,
          joinByRequestEnabled: false,
          joinByEmailEnabled: false,
          ruleUseDeadline: input.ruleUseDeadline ?? false,
          ruleDefaultDeadlineTime: input.ruleDefaultDeadlineTime ?? "23:59",
          ruleAllowLateSubmission: input.ruleAllowLateSubmission ?? true,
          ruleUseAiFeedback: input.ruleUseAiFeedback ?? true,
          ruleAllowEditAfterSubmit: input.ruleAllowEditAfterSubmit ?? true,
          ruleAssignmentCreatorRoles: input.ruleAssignmentCreatorRoles ?? "OWNER_AND_MANAGER",
          memberCount: 1,
        }),
      );

      await memberRepo.save(
        memberRepo.create({ groupId: created.id, userId, role: "OWNER" }),
      );

      await linkRepo.save(
        linkRepo.create({
          groupId: created.id,
          token: randomInviteLinkToken(),
          revokedAt: null,
        }),
      );

      return created;
    });
  }

  async updateGroup(groupId: string, patch: UpdateGroupInput): Promise<Group> {
    await this.ensureInitialized();
    const group = await this.getById(groupId);
    if (patch.name !== undefined) group.name = patch.name;
    if (patch.description !== undefined) group.description = patch.description;
    if (patch.maxMembers !== undefined) {
      let m = patch.maxMembers;
      if (m < MIN_MEMBERS) m = MIN_MEMBERS;
      if (m > MAX_MEMBERS) m = MAX_MEMBERS;
      if (m < group.memberCount) {
        throw new BadRequestException("최대 인원은 현재 멤버 수보다 작을 수 없습니다.");
      }
      group.maxMembers = m;
    }
    if (patch.joinByCodeEnabled !== undefined) group.joinByCodeEnabled = patch.joinByCodeEnabled;
    if (patch.joinByLinkEnabled !== undefined) group.joinByLinkEnabled = patch.joinByLinkEnabled;
    if (patch.ruleUseDeadline !== undefined) group.ruleUseDeadline = patch.ruleUseDeadline;
    if (patch.ruleDefaultDeadlineTime !== undefined) {
      group.ruleDefaultDeadlineTime = patch.ruleDefaultDeadlineTime;
    }
    if (patch.ruleAllowLateSubmission !== undefined) {
      group.ruleAllowLateSubmission = patch.ruleAllowLateSubmission;
    }
    if (patch.ruleUseAiFeedback !== undefined) group.ruleUseAiFeedback = patch.ruleUseAiFeedback;
    if (patch.ruleAllowEditAfterSubmit !== undefined) {
      group.ruleAllowEditAfterSubmit = patch.ruleAllowEditAfterSubmit;
    }
    if (patch.ruleAssignmentCreatorRoles !== undefined) {
      group.ruleAssignmentCreatorRoles = patch.ruleAssignmentCreatorRoles;
    }
    return this.ds.getRepository(Group).save(group);
  }

  async regenerateGroupCode(groupId: string): Promise<{ groupCode: string }> {
    await this.ensureInitialized();
    return this.ds.transaction(async (tx) => {
      const groupRepo = tx.getRepository(Group);
      const linkRepo = tx.getRepository(GroupInviteLink);
      const group = await groupRepo.findOne({ where: { id: groupId, deletedAt: IsNull() } });
      if (group === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      const newCode = await this.generateUniqueGroupCode(tx);
      group.groupCode = newCode;
      await groupRepo.save(group);

      await linkRepo
        .createQueryBuilder()
        .update(GroupInviteLink)
        .set({ revokedAt: new Date() })
        .where("group_id = :gid", { gid: groupId })
        .andWhere("revoked_at IS NULL")
        .execute();

      await linkRepo.save(
        linkRepo.create({
          groupId,
          token: randomInviteLinkToken(),
          revokedAt: null,
        }),
      );

      return { groupCode: newCode };
    });
  }

  async refreshMemberCount(groupId: string): Promise<void> {
    await this.ensureInitialized();
    const n = await this.ds.getRepository(GroupMember).count({
      where: { groupId, leftAt: IsNull() },
    });
    await this.ds.getRepository(Group).update({ id: groupId }, { memberCount: n });
  }

  async getById(id: string): Promise<Group> {
    await this.ensureInitialized();
    const group = await this.ds.getRepository(Group).findOne({ where: { id, deletedAt: IsNull() } });
    if (group === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
    return group;
  }

  async deleteWithCascade(groupId: string, confirmGroupName: string): Promise<{ deleted: true }> {
    await this.ensureInitialized();
    const group = await this.getById(groupId);
    if (group.name !== confirmGroupName) {
      throw new BadRequestException("그룹명 확인이 일치하지 않습니다.");
    }
    return this.ds.transaction(async (tx) => {
      const assignmentIds = (
        await tx.getRepository(Assignment).find({ where: { groupId }, select: ["id"] })
      ).map((a) => a.id);
      const submissionIds =
        assignmentIds.length === 0
          ? []
          : (
              await tx
                .getRepository(Submission)
                .find({ where: { assignmentId: In(assignmentIds) }, select: ["id"] })
            ).map((s) => s.id);
      const reviewIds =
        submissionIds.length === 0
          ? []
          : (
              await tx
                .getRepository(Review)
                .find({ where: { submissionId: In(submissionIds) }, select: ["id"] })
            ).map((r) => r.id);

      if (reviewIds.length > 0) {
        await tx.getRepository(ReviewReply).delete({ reviewId: In(reviewIds) });
        await tx.getRepository(Review).delete({ id: In(reviewIds) });
      }
      if (submissionIds.length > 0) {
        await tx.getRepository(AiAnalysis).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(SubmissionDiff).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(SubmissionVersion).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(Comment).delete({ submissionId: In(submissionIds) });
        await tx.getRepository(Submission).delete({ id: In(submissionIds) });
      }
      if (assignmentIds.length > 0) {
        await tx.getRepository(Comment).delete({ assignmentId: In(assignmentIds) });
        await tx.getRepository(CalendarEvent).delete({ assignmentId: In(assignmentIds) });
        await tx.getRepository(ProblemAnalysis).delete({ assignmentId: In(assignmentIds) });
        await tx.getRepository(AssignmentPolicyOverride).delete({ assignmentId: In(assignmentIds) });
        await tx.getRepository(Assignment).delete({ id: In(assignmentIds) });
      }

      const announcementIds = (
        await tx.getRepository(Announcement).find({ where: { groupId }, select: ["id"] })
      ).map((a) => a.id);
      const communityIds = (
        await tx.getRepository(CommunityPost).find({ where: { groupId }, select: ["id"] })
      ).map((p) => p.id);
      if (announcementIds.length > 0) {
        await tx.getRepository(PostComment).delete({ announcementId: In(announcementIds) });
      }
      if (communityIds.length > 0) {
        await tx.getRepository(PostComment).delete({ communityPostId: In(communityIds) });
      }
      if (announcementIds.length > 0) {
        await tx.getRepository(Announcement).delete({ id: In(announcementIds) });
      }
      if (communityIds.length > 0) {
        await tx.getRepository(CommunityPost).delete({ id: In(communityIds) });
      }

      await tx.getRepository(GroupInviteLink).delete({ groupId });
      await tx.getRepository(GroupEmailInvite).delete({ groupId });
      await tx.getRepository(JoinRequest).delete({ groupId });
      await tx.getRepository(GroupMember).delete({ groupId });
      await tx.getRepository(Group).softDelete({ id: groupId });

      return { deleted: true } as const;
    });
  }

  async listMembers(groupId: string): Promise<
    Array<{
      userId: string;
      nickname: string;
      profileImageUrl: string;
      role: GroupRole;
      joinedAt: Date;
    }>
  > {
    await this.ensureInitialized();
    const members = await this.ds
      .getRepository(GroupMember)
      .find({ where: { groupId, leftAt: IsNull() } });
    if (members.length === 0) return [];
    const users = await this.ds
      .getRepository(User)
      .find({ where: { id: In(members.map((m) => m.userId)) }, withDeleted: true });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return members.map((m) => {
      const u = userMap.get(m.userId)!;
      return {
        userId: m.userId,
        nickname: u.nickname,
        profileImageUrl: u.profileImageUrl,
        role: m.role as GroupRole,
        joinedAt: m.joinedAt,
      };
    });
  }

  async getMembership(groupId: string, userId: string): Promise<GroupMember | null> {
    await this.ensureInitialized();
    return this.ds
      .getRepository(GroupMember)
      .findOne({ where: { groupId, userId, leftAt: IsNull() } });
  }

  async requireRole(groupId: string, userId: string): Promise<GroupRole> {
    const m = await this.getMembership(groupId, userId);
    if (m === null) throw new ForbiddenException("그룹 멤버가 아닙니다.");
    return m.role as GroupRole;
  }

  async setMemberRole(groupId: string, targetUserId: string, role: GroupRole): Promise<void> {
    await this.ensureInitialized();
    const m = await this.getMembership(groupId, targetUserId);
    if (m === null) throw new NotFoundException("멤버를 찾을 수 없습니다.");
    if (role === "OWNER") {
      throw new BadRequestException("그룹장 위임은 별도 엔드포인트를 사용하세요.");
    }
    if (m.role === "OWNER") {
      throw new BadRequestException("그룹장은 역할 변경 대상이 아닙니다.");
    }
    m.role = role;
    await this.ds.getRepository(GroupMember).save(m);
  }

  async transferOwnership(groupId: string, currentOwnerId: string, nextOwnerId: string): Promise<void> {
    await this.ensureInitialized();
    if (currentOwnerId === nextOwnerId) {
      throw new BadRequestException("자기 자신에게 위임할 수 없습니다.");
    }
    return this.ds.transaction(async (tx) => {
      const groupRepo = tx.getRepository(Group);
      const memberRepo = tx.getRepository(GroupMember);
      const group = await groupRepo.findOne({ where: { id: groupId } });
      if (group === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      if (group.ownerUserId !== currentOwnerId) {
        throw new ForbiddenException("그룹장만 위임할 수 있습니다.");
      }
      const next = await memberRepo.findOne({
        where: { groupId, userId: nextOwnerId, leftAt: IsNull() },
      });
      if (next === null) throw new NotFoundException("대상 멤버를 찾을 수 없습니다.");
      const current = await memberRepo.findOne({
        where: { groupId, userId: currentOwnerId, leftAt: IsNull() },
      });
      if (current === null) throw new NotFoundException("현재 그룹장 멤버 정보가 없습니다.");
      next.role = "OWNER";
      current.role = "MANAGER";
      group.ownerUserId = nextOwnerId;
      await memberRepo.save([next, current]);
      await groupRepo.save(group);
    });
  }

  async removeMember(groupId: string, targetUserId: string): Promise<void> {
    await this.ensureInitialized();
    const m = await this.getMembership(groupId, targetUserId);
    if (m === null) throw new NotFoundException("멤버를 찾을 수 없습니다.");
    if (m.role === "OWNER") {
      throw new BadRequestException("그룹장은 강퇴할 수 없습니다. 위임 후 진행하세요.");
    }
    m.leftAt = new Date();
    await this.ds.getRepository(GroupMember).save(m);
    await this.refreshMemberCount(groupId);
  }

  async leaveSelf(groupId: string, userId: string): Promise<void> {
    await this.ensureInitialized();
    const m = await this.getMembership(groupId, userId);
    if (m === null) throw new NotFoundException("이미 멤버가 아닙니다.");
    if (m.role === "OWNER") {
      throw new ConflictException("그룹장은 탈퇴할 수 없습니다. 위임 후 진행하거나 그룹을 삭제하세요.");
    }
    m.leftAt = new Date();
    await this.ds.getRepository(GroupMember).save(m);
    await this.refreshMemberCount(groupId);
  }
}
