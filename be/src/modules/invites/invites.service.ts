// 그룹 초대 링크·그룹 코드를 관리하는 서비스입니다.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import { ENV } from "../../config/env.js";
import { dataSource } from "../../config/data-source.js";
import { Group } from "../groups/group.entity.js";
import { GroupMember } from "../groups/group-member.entity.js";
import { GroupsService } from "../groups/groups.service.js";
import { GroupInviteLink } from "./group-invite-link.entity.js";

function randomTokenUrl(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class InvitesService {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  private get ds() {
    return dataSource;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.ds.isInitialized) await this.ds.initialize();
  }

  async preview(params: { code?: string; link?: string }): Promise<{
    groupId: string;
    name: string;
    description: string;
    memberCount: number;
    maxMembers: number;
    joinMethods: {
      code: boolean;
      link: boolean;
    };
  }> {
    await this.ensureInitialized();
    if (params.code !== undefined) {
      const g = await this.ds.getRepository(Group).findOne({
        where: { groupCode: params.code, deletedAt: IsNull() },
      });
      if (g === null) throw new NotFoundException("그룹을 찾을 수 없습니다.");
      if (!g.joinByCodeEnabled) {
        throw new ForbiddenException("이 그룹은 코드로 가입할 수 없습니다.");
      }
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
      if (!g.joinByLinkEnabled) {
        throw new ForbiddenException("이 그룹은 링크로 가입할 수 없습니다.");
      }
      return this.toPreviewDto(g);
    }
    throw new BadRequestException("code 또는 link 중 하나가 필요합니다.");
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
    if (!group.joinByLinkEnabled) {
      throw new ForbiddenException("이 그룹은 링크로 가입할 수 없습니다.");
    }
    return { link, group };
  }

  async joinViaLink(token: string, userId: string): Promise<{ groupId: string }> {
    await this.ensureInitialized();
    return this.ds
      .transaction(async (tx) => {
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
      })
      .then(async (r) => {
        await this.groups.refreshMemberCount(r.groupId);
        return r;
      });
  }

  async joinViaCode(code: string, userId: string): Promise<{ groupId: string }> {
    await this.ensureInitialized();
    return this.ds
      .transaction(async (tx) => {
        const group = await tx.getRepository(Group).findOne({
          where: { groupCode: code, deletedAt: IsNull() },
        });
        if (group === null) throw new NotFoundException("그룹 코드가 유효하지 않습니다.");
        if (!group.joinByCodeEnabled) {
          throw new ForbiddenException("이 그룹은 코드로 가입할 수 없습니다.");
        }
        await this.addMemberOrThrow(tx, group, userId);
        return { groupId: group.id };
      })
      .then(async (r) => {
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
}
