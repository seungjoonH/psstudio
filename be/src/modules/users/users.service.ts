// DB 기반 사용자 upsert/조회 서비스입니다.
import { Injectable, NotFoundException } from "@nestjs/common";
import type { OAuthProvider } from "@psstudio/shared";
import { dataSource } from "../../config/data-source.js";
import { User } from "./user.entity.js";

type UpsertPayload = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  displayName: string;
  profileImageUrl: string;
};

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
}
