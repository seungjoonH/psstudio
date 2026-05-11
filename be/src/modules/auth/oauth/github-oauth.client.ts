// GitHub OAuth code 교환과 user/email 조회 클라이언트입니다.
import { Injectable } from "@nestjs/common";
import { ENV } from "../../../config/env.js";

export type GitHubProfile = {
  providerUserId: string;
  email: string;
  displayName: string;
  profileImageUrl: string;
};

@Injectable()
export class GitHubOAuthClient {
  buildAuthorizeUrl(state: string): string {
    const cfg = ENV.github();
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: "read:user user:email",
      state,
      allow_signup: "true",
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForProfile(code: string): Promise<GitHubProfile> {
    const cfg = ENV.github();
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(`github token exchange failed: ${tokenRes.status}`);
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (typeof token.access_token !== "string") {
      throw new Error("github token response missing access_token");
    }
    const auth = `token ${token.access_token}`;
    const userRes = await fetch("https://api.github.com/user", {
      headers: { authorization: auth, accept: "application/vnd.github+json" },
    });
    if (!userRes.ok) {
      throw new Error(`github user fetch failed: ${userRes.status}`);
    }
    const profile = (await userRes.json()) as {
      id?: number;
      login?: string;
      name?: string;
      email?: string | null;
      avatar_url?: string;
    };
    if (typeof profile.id !== "number" || typeof profile.login !== "string") {
      throw new Error("github user missing required fields");
    }
    let email = typeof profile.email === "string" ? profile.email : "";
    if (email.length === 0) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { authorization: auth, accept: "application/vnd.github+json" },
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{
          email: string;
          primary?: boolean;
          verified?: boolean;
        }>;
        const primary = emails.find((e) => e.primary === true && e.verified === true);
        const verified = emails.find((e) => e.verified === true);
        email = primary?.email ?? verified?.email ?? emails[0]?.email ?? "";
      }
    }
    if (email.length === 0) {
      throw new Error("github user has no usable email");
    }
    return {
      providerUserId: String(profile.id),
      email,
      displayName: typeof profile.name === "string" && profile.name.length > 0 ? profile.name : profile.login,
      profileImageUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : "",
    };
  }
}
