// 그룹 초대 링크·그룹 코드·이메일 초대·가입 신청을 관리하는 서비스입니다.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { JoinRequestStatus } from "@psstudio/shared";
import { IsNull, type EntityManager, In } from "typeorm";
import { ENV } from "../../config/env.js";
import { dataSource } from "../../config/data-source.js";
import { redisClient } from "../../shared/redis/redis.client.js";
import { ResendMailService } from "../email/resend-mail.service.js";
import { Group } from "../groups/group.entity.js";
import { GroupMember } from "../groups/group-member.entity.js";
import { GroupsService } from "../groups/groups.service.js";
import { User } from "../users/user.entity.js";
import { GroupEmailInvite } from "./group-email-invite.entity.js";
import { GroupInviteLink } from "./group-invite-link.entity.js";
import { JoinRequest } from "./join-request.entity.js";

const EMAIL_BATCH_MAX = 20;
const EMAIL_RATE_PER_HOUR = 50;
const EMAIL_INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

function randomTokenUrl(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly groups: GroupsService,
    private readonly mail: ResendMailService,
  ) {}

  private get ds() {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  async preview(params: {
    code?: string;
    link?: string;
    emailToken?: string;
  }): Promise<{
    groupId: string;
    name: string;
    description: string;
    memberCount: number;
    maxMembers: number;
    joinMethods: {
      code: boolean;
      link: boolean;
      request: boolean;
      email: boolean;
    };
  }> {
    await this.ensureInitialized();
    if (params.code !== undefined) {
      const g = await this.ds.getRepository(Group).findOne({
        where: { groupCode: params.code, deletedAt: IsNull() },
      });
      if (g === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      return this.toPreviewDto(g);
    }
    if (params.link !== undefined) {
      const link = await this.ds.getRepository(GroupInviteLink).findOne({
        where: { token: params.link, revokedAt: IsNull() },
      });
      if (link === null) throw new NotFoundException("초대 링크를 찾을 수 없습니다.");
      const g = await this.ds.getRepository(Group).findOne({
        where: { id: link.groupId, deletedAt: IsNull() },
      });
      if (g === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      return this.toPreviewDto(g);
    }
    if (params.emailToken !== undefined) {
      const inv = await this.ds.getRepository(GroupEmailInvite).findOne({
        where: { token: params.emailToken },
      });
      if (inv === null) throw new NotFoundException("초대를 찾을 수 없습니다.");
      if (inv.expiresAt.getTime() <= Date.now() || inv.acceptedAt !== null) {
        throw new NotFoundException("초대가 만료되었습니다.");
      }
      const g = await this.ds.getRepository(Group).findOne({
        where: { id: inv.groupId, deletedAt: IsNull() },
      });
      if (g === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      return this.toPreviewDto(g);
    }
    throw new BadRequestException("code, link, emailToken 중 하나가 필요합니다.");
  }

  private toPreviewDto(g: Group) {
    return {
      groupId: g.id,
      name: g.name,
      description: g.description,
      memberCount: g.memberCount,
      maxMembers: g.maxMembers,
      joinMethods: {
        code: g.joinByCodeEnabled,
        link: g.joinByLinkEnabled,
        request: g.joinByRequestEnabled,
        email: g.joinByEmailEnabled,
      },
    };
  }

  async getGroupCode(groupId: string): Promise<{ code: string }> {
    await this.ensureInitialized();
    const g = await this.groups.getById(groupId);
    return { code: g.groupCode };
  }

  async listActiveInviteLinks(groupId: string): Promise<GroupInviteLink[]> {
    await this.ensureInitialized();
    return this.ds.getRepository(GroupInviteLink).find({
      where: { groupId, revokedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }

  async createInviteLink(groupId: string, creatorId: string): Promise<{ token: string; url: string }> {
    await this.ensureInitialized();
    return this.ds.transaction(async (tx) => {
      const linkRepo = tx.getRepository(GroupInviteLink);
      await linkRepo
        .createQueryBuilder()
        .update(GroupInviteLink)
        .set({ revokedAt: new Date() })
        .where("group_id = :gid", { gid: groupId })
        .andWhere("revoked_at IS NULL")
        .execute();
      const token = randomTokenUrl();
      await linkRepo.save(linkRepo.create({ groupId, token, revokedAt: null }));
      const url = `${ENV.fePublicBaseUrl()}/invite/${token}`;
      void creatorId;
      return { token, url };
    });
  }

  async revokeInviteLink(groupId: string, linkId: string): Promise<void> {
    await this.ensureInitialized();
    const repo = this.ds.getRepository(GroupInviteLink);
    const link = await repo.findOne({ where: { id: linkId, groupId } });
    if (link === null) throw new NotFoundException("초대 링크를 찾을 수 없습니다.");
    link.revokedAt = new Date();
    await repo.save(link);
  }

  async resolveInviteLink(token: string): Promise<{ link: GroupInviteLink; group: Group }> {
    await this.ensureInitialized();
    const link = await this.ds.getRepository(GroupInviteLink).findOne({
      where: { token, revokedAt: IsNull() },
    });
    if (link === null) throw new NotFoundException("초대 링크를 찾을 수 없습니다.");
    const group = await this.ds.getRepository(Group).findOne({
      where: { id: link.groupId, deletedAt: IsNull() },
    });
    if (group === null) throw new NotFoundException("그룹이 존재하지 않습니다.");
    return { link, group };
  }

  async joinViaLink(token: string, userId: string): Promise<{ groupId: string }> {
    await this.ensureInitialized();
    return this.ds.transaction(async (tx) => {
      const link = await tx.getRepository(GroupInviteLink).findOne({
        where: { token, revokedAt: IsNull() },
      });
      if (link === null) throw new NotFoundException("초대 링크를 찾을 수 없습니다.");
      const group = await tx.getRepository(Group).findOne({
        where: { id: link.groupId, deletedAt: IsNull() },
      });
      if (group === null) throw new NotFoundException("그룹이 존재하지 않습니다.");
      if (!group.joinByLinkEnabled) {
        throw new ForbiddenException("이 그룹은 링크로 가입할 수 없습니다.");
      }
      await this.addMemberOrThrow(tx, group, userId);
      return { groupId: group.id };
    }).then(async (r) => {
      await this.groups.refreshMemberCount(r.groupId);
      return r;
    });
  }

  async joinViaCode(code: string, userId: string): Promise<{ groupId: string }> {
    await this.ensureInitialized();
    return this.ds.transaction(async (tx) => {
      const group = await tx.getRepository(Group).findOne({
        where: { groupCode: code, deletedAt: IsNull() },
      });
      if (group === null) throw new NotFoundException("그룹 코드가 유효하지 않습니다.");
      if (!group.joinByCodeEnabled) {
        throw new ForbiddenException("이 그룹은 코드로 가입할 수 없습니다.");
      }
      await this.addMemberOrThrow(tx, group, userId);
      return { groupId: group.id };
    }).then(async (r) => {
      await this.groups.refreshMemberCount(r.groupId);
      return r;
    });
  }

  async joinViaEmailToken(token: string, userId: string): Promise<{ groupId: string }> {
    await this.ensureInitialized();
    return this.ds.transaction(async (tx) => {
      const invRepo = tx.getRepository(GroupEmailInvite);
      const inv = await invRepo.findOne({ where: { token } });
      if (inv === null) throw new NotFoundException("초대를 찾을 수 없습니다.");
      if (inv.expiresAt.getTime() <= Date.now()) {
        throw new NotFoundException("초대가 만료되었습니다.");
      }
      if (inv.acceptedAt !== null) {
        throw new ConflictException("이미 사용된 초대입니다.");
      }
      const group = await tx.getRepository(Group).findOne({
        where: { id: inv.groupId, deletedAt: IsNull() },
      });
      if (group === null) throw new NotFoundException("그룹이 존재하지 않습니다.");
      if (!group.joinByEmailEnabled) {
        throw new ForbiddenException("이 그룹은 이메일 초대로 가입할 수 없습니다.");
      }
      await this.addMemberOrThrow(tx, group, userId);
      inv.acceptedAt = new Date();
      inv.acceptedUserId = userId;
      await invRepo.save(inv);
      return { groupId: group.id };
    }).then(async (r) => {
      await this.groups.refreshMemberCount(r.groupId);
      return r;
    });
  }

  private async addMemberOrThrow(tx: EntityManager, group: Group, userId: string): Promise<void> {
    const memberRepo = tx.getRepository(GroupMember);
    const active = await memberRepo.count({ where: { groupId: group.id, leftAt: IsNull() } });
    if (active >= group.maxMembers) {
      throw new ConflictException("그룹 정원이 가득 찼습니다.");
    }
    const existing = await memberRepo.findOne({ where: { groupId: group.id, userId } });
    if (existing !== null) {
      if (existing.leftAt === null) {
        throw new ConflictException("이미 그룹 멤버입니다.");
      }
      existing.leftAt = null;
      existing.role = "MEMBER";
      existing.joinedAt = new Date();
      await memberRepo.save(existing);
      return;
    }
    await memberRepo.save(memberRepo.create({ groupId: group.id, userId, role: "MEMBER" }));
  }

  async requestJoin(groupId: string, userId: string): Promise<JoinRequest> {
    await this.ensureInitialized();
    const group = await this.ds
      .getRepository(Group)
      .findOne({ where: { id: groupId, deletedAt: IsNull() } });
    if (group === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
    if (!group.joinByRequestEnabled) {
      throw new ForbiddenException("이 그룹은 가입 신청을 받지 않습니다.");
    }
    const existingMember = await this.ds
      .getRepository(GroupMember)
      .findOne({ where: { groupId, userId, leftAt: IsNull() } });
    if (existingMember !== null) {
      throw new ConflictException("이미 그룹 멤버입니다.");
    }
    const repo = this.ds.getRepository(JoinRequest);
    const pending = await repo.findOne({ where: { groupId, userId, status: "PENDING" } });
    if (pending !== null) return pending;
    return repo.save(repo.create({ groupId, userId, status: "PENDING" }));
  }

  async listJoinRequests(
    groupId: string,
    status: JoinRequestStatus,
  ): Promise<
    Array<{ id: string; userId: string; nickname: string; profileImageUrl: string; createdAt: Date }>
  > {
    await this.ensureInitialized();
    const requests = await this.ds
      .getRepository(JoinRequest)
      .find({ where: { groupId, status }, order: { createdAt: "DESC" } });
    if (requests.length === 0) return [];
    const users = await this.ds
      .getRepository(User)
      .find({ where: { id: In(requests.map((r) => r.userId)) }, withDeleted: true });
    const map = new Map(users.map((u) => [u.id, u]));
    return requests.map((r) => {
      const u = map.get(r.userId)!;
      return {
        id: r.id,
        userId: r.userId,
        nickname: u.nickname,
        profileImageUrl: u.profileImageUrl,
        createdAt: r.createdAt,
      };
    });
  }

  async decideJoinRequest(
    groupId: string,
    requestId: string,
    deciderUserId: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<void> {
    await this.ensureInitialized();
    await this.ds.transaction(async (tx) => {
      const group = await tx.getRepository(Group).findOne({
        where: { id: groupId, deletedAt: IsNull() },
      });
      if (group === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      const repo = tx.getRepository(JoinRequest);
      const req = await repo.findOne({ where: { id: requestId, groupId } });
      if (req === null) throw new NotFoundException("가입 신청을 찾을 수 없습니다.");
      if (req.status !== "PENDING") {
        throw new BadRequestException("이미 처리된 신청입니다.");
      }
      if (decision === "APPROVED" && !group.joinByRequestEnabled) {
        throw new ForbiddenException("이 그룹은 가입 신청을 받지 않습니다.");
      }
      if (decision === "REJECTED") {
        req.status = "REJECTED";
        req.decidedBy = deciderUserId;
        req.decidedAt = new Date();
        await repo.save(req);
        return;
      }
      const active = await tx.getRepository(GroupMember).count({
        where: { groupId, leftAt: IsNull() },
      });
      if (active >= group.maxMembers) {
        throw new ConflictException("그룹 정원이 가득 찼습니다.");
      }
      req.status = "APPROVED";
      req.decidedBy = deciderUserId;
      req.decidedAt = new Date();
      await repo.save(req);
      await this.addMemberOrThrow(tx, group, req.userId);
    });
    await this.groups.refreshMemberCount(groupId);
  }

  async sendEmailInvites(
    groupId: string,
    emails: string[],
    invitedByUserId: string,
  ): Promise<{ sent: number; failed: Array<{ email: string; reason: string }> }> {
    await this.ensureInitialized();
    if (emails.length > EMAIL_BATCH_MAX) {
      throw new BadRequestException(`한 번에 최대 ${EMAIL_BATCH_MAX}개까지 발송할 수 있습니다.`);
    }
    const group = await this.groups.getById(groupId);
    if (!group.joinByEmailEnabled) {
      throw new ForbiddenException("이 그룹은 이메일 초대를 보낼 수 없습니다.");
    }

    const failed: Array<{ email: string; reason: string }> = [];
    let sent = 0;
    const rateKey = `email_invite_rate:${groupId}`;

    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      if (email.length === 0) continue;

      const count = await redisClient.incr(rateKey);
      if (count === 1) {
        await redisClient.expire(rateKey, 3600);
      }
      if (count > EMAIL_RATE_PER_HOUR) {
        await redisClient.decr(rateKey);
        failed.push({ email, reason: "RATE_LIMITED" });
        continue;
      }

      try {
        const token = randomTokenUrl();
        const expiresAt = new Date(Date.now() + EMAIL_INVITE_TTL_MS);
        await this.ds.transaction(async (tx) => {
          const invRepo = tx.getRepository(GroupEmailInvite);
          await invRepo
            .createQueryBuilder()
            .update(GroupEmailInvite)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where("group_id = :gid", { gid: groupId })
            .andWhere("email = :email", { email })
            .andWhere("accepted_at IS NULL")
            .execute();
          await invRepo.save(
            invRepo.create({
              groupId,
              invitedByUserId,
              email,
              token,
              expiresAt,
              acceptedAt: null,
              acceptedUserId: null,
            }),
          );
        });

        const acceptUrl = `${ENV.fePublicBaseUrl()}/invite/email/${token}`;
        await this.mail.sendTransactional({
          to: email,
          subject: `[${group.name}] PS Studio 그룹 초대`,
          html: `<p>그룹에 초대되었습니다.</p><p><a href="${acceptUrl}">초대 수락하기</a></p>`,
        });
        sent += 1;
      } catch (e) {
        await redisClient.decr(rateKey);
        failed.push({
          email,
          reason: e instanceof Error ? e.message : "UNKNOWN",
        });
      }
    }

    return { sent, failed };
  }

  async listEmailInvites(groupId: string): Promise<GroupEmailInvite[]> {
    await this.ensureInitialized();
    return this.ds.getRepository(GroupEmailInvite).find({
      where: { groupId },
      order: { createdAt: "DESC" },
    });
  }

  async revokeEmailInvite(groupId: string, inviteId: string): Promise<void> {
    await this.ensureInitialized();
    const repo = this.ds.getRepository(GroupEmailInvite);
    const inv = await repo.findOne({ where: { id: inviteId, groupId } });
    if (inv === null) throw new NotFoundException("초대를 찾을 수 없습니다.");
    inv.expiresAt = new Date(Date.now() - 1000);
    await repo.save(inv);
  }
}

