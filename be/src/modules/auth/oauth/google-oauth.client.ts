// Google OAuth code 교환과 userinfo 조회 클라이언트입니다.
import { BadRequestException, Injectable } from "@nestjs/common";
import { ENV } from "../../../config/env.js";

export type GoogleProfile = {
  providerUserId: string;
  email: string;
  displayName: string;
  profileImageUrl: string;
};

async function readGoogleOAuthErrorMessage(res: Response, step: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; error_description?: string };
    const detail = body.error_description ?? body.error;
    if (typeof detail === "string" && detail.length > 0) {
      return `Google OAuth ${step} 실패: ${detail}`;
    }
  } catch {
    /* ignore parse error */
  }
  return `Google OAuth ${step} 실패 (HTTP ${res.status})`;
}

@Injectable()
export class GoogleOAuthClient {
  buildAuthorizeUrl(state: string): string {
    const cfg = ENV.google();
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const cfg = ENV.google();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(await readGoogleOAuthErrorMessage(tokenRes, "토큰 교환"));
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (typeof token.access_token !== "string") {
      throw new BadRequestException("Google OAuth 토큰 응답에 access_token이 없습니다.");
    }
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!userRes.ok) {
      throw new BadRequestException(await readGoogleOAuthErrorMessage(userRes, "userinfo 조회"));
    }
    const profile = (await userRes.json()) as {
      id?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (typeof profile.id !== "string" || typeof profile.email !== "string") {
      throw new BadRequestException("Google userinfo에 id 또는 email이 없습니다.");
    }
    return {
      providerUserId: profile.id,
      email: profile.email,
      displayName: typeof profile.name === "string" ? profile.name : profile.email,
      profileImageUrl: typeof profile.picture === "string" ? profile.picture : "",
    };
  }
}
