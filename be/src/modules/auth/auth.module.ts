// 인증 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { GitHubOAuthClient } from "./oauth/github-oauth.client.js";
import { GoogleOAuthClient } from "./oauth/google-oauth.client.js";
import { SessionService } from "./session/session.service.js";

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, GoogleOAuthClient, GitHubOAuthClient, SessionService],
  // AuthGuard가 UsersService를 주입하므로, 이 모듈을 import하는 모듈에서 UsersService를 해석할 수 있게 UsersModule을 재내보냅니다.
  exports: [AuthGuard, SessionService, forwardRef(() => UsersModule)],
})
export class AuthModule {}
