// OAuth provider 식별자를 정의합니다.
export const OAUTH_PROVIDERS = {
  google: "google",
  github: "github",
} as const;

export type OAuthProvider = keyof typeof OAUTH_PROVIDERS;

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}
