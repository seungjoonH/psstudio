// 세션 쿠키를 검증해 요청에 currentUser를 채우는 가드입니다.
import {
  CanActivate,
  Dependencies,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { parse } from "cookie";
import type { Request } from "express";
import { ENV } from "../../../config/env.js";
import { UsersService } from "../../users/users.service.js";
import { SessionService } from "../session/session.service.js";

export type RequestUser = {
  id: string;
  nickname: string;
  email: string;
  provider: "google" | "github" | "system";
  profileImageUrl: string;
};

export type AuthedRequest = Request & {
  currentUser?: RequestUser;
  sessionId?: string;
};

@Injectable()
@Dependencies(SessionService, UsersService)
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const cookieHeader = req.headers.cookie ?? "";
    const cookies = parse(cookieHeader);
    const sessionId = cookies[ENV.sessionCookieName()];
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new UnauthorizedException("로그인이 필요합니다.");
    }
    const session = await this.sessionService.touch(sessionId);
    if (session === null) {
      throw new UnauthorizedException("세션이 유효하지 않습니다.");
    }
    const user = await this.usersService.getById(session.userId);
    req.currentUser = {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      provider: user.provider,
      profileImageUrl: user.profileImageUrl,
    };
    req.sessionId = sessionId;
    return true;
  }
}
