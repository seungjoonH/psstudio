// OAuth 흐름을 통합 처리하는 서비스입니다.
import { BadRequestException, Dependencies, Injectable } from "@nestjs/common";
import { isOAuthProvider, type OAuthProvider } from "@psstudio/shared";
import { UsersService } from "../users/users.service.js";
import { GitHubOAuthClient } from "./oauth/github-oauth.client.js";
import { GoogleOAuthClient } from "./oauth/google-oauth.client.js";
import { SessionService } from "./session/session.service.js";

@Injectable()
@Dependencies(GoogleOAuthClient, GitHubOAuthClient, UsersService, SessionService)
export class AuthService {
  constructor(
    private readonly google: GoogleOAuthClient,
    private readonly github: GitHubOAuthClient,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
  ) {}

  parseProvider(value: string): OAuthProvider {
    if (!isOAuthProvider(value)) throw new BadRequestException("지원하지 않는 OAuth provider 입니다.");
    return value;
  }

  buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
    switch (provider) {
      case "google": return this.google.buildAuthorizeUrl(state);
      case "github": return this.github.buildAuthorizeUrl(state);
    }
  }

  async completeOAuth(provider: OAuthProvider, code: string): Promise<{ sessionId: string; userId: string }> {
    const profile = provider === "google"
      ? await this.google.exchangeCodeForProfile(code)
      : await this.github.exchangeCodeForProfile(code);
    const user = await this.usersService.upsertByProviderIdentity({
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      displayName: profile.displayName,
      profileImageUrl: profile.profileImageUrl,
    });
    const sessionId = await this.sessionService.create({ userId: user.id, provider });
    return { sessionId, userId: user.id };
  }
}
