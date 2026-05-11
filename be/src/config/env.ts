// 환경변수를 fallback 없이 읽고 누락 시 즉시 실패시키는 단일 진입점입니다.
export function readRequiredEnv(key: string): string {
  const value = process.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }
  return value;
}

export function readRequiredNumber(key: string): number {
  const raw = readRequiredEnv(key);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} 환경변수는 숫자여야 합니다.`);
  }
  return value;
}

export const ENV = {
  bePort: () => readRequiredNumber("BE_PORT"),
  bePublicBaseUrl: () => readRequiredEnv("BE_PUBLIC_BASE_URL"),
  fePublicBaseUrl: () => readRequiredEnv("FE_PUBLIC_BASE_URL"),
  databaseUrl: () => readRequiredEnv("DATABASE_URL"),
  redisUrl: () => readRequiredEnv("REDIS_URL"),
  sessionSecret: () => readRequiredEnv("SESSION_SECRET"),
  sessionCookieName: () => readRequiredEnv("SESSION_COOKIE_NAME"),
  google: () => ({
    clientId: readRequiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: readRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri: readRequiredEnv("GOOGLE_OAUTH_REDIRECT_URI"),
  }),
  github: () => ({
    clientId: readRequiredEnv("GITHUB_OAUTH_CLIENT_ID"),
    clientSecret: readRequiredEnv("GITHUB_OAUTH_CLIENT_SECRET"),
    redirectUri: readRequiredEnv("GITHUB_OAUTH_REDIRECT_URI"),
  }),
  llmProvider: () => readRequiredEnv("LLM_PROVIDER"),
  openRouterApiKey: () => readRequiredEnv("OPEN_ROUTER_API_KEY"),
  requestyApiKey: () => readRequiredEnv("REQUESTY_API_KEY"),
  llmModelProblemAnalyze: () => readRequiredEnv("LLM_MODEL_PROBLEM_ANALYZE"),
  /** 과제 생성 폼「AI 자동 채우기」전용(제목 보조·힌트·알고리즘 초안). */
  llmModelAssignmentAutofill: () => readRequiredEnv("LLM_MODEL_ASSIGNMENT_AUTOFILL"),
  llmModelSubmissionReview: () => readRequiredEnv("LLM_MODEL_SUBMISSION_REVIEW"),
  resendApiKey: () => readRequiredEnv("RESEND_API_KEY"),
  emailFromAddress: () => readRequiredEnv("EMAIL_FROM_ADDRESS"),
  aiTokenDefault: () => readRequiredNumber("AI_TOKEN_DEFAULT"),
};
