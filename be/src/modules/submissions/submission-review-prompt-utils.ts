// AI 제출 리뷰 LLM 프롬프트 조립에 쓰는 공용 유틸입니다.

export type AssignmentReviewContext = {
  title: string;
  problemUrl: string;
  platform: string;
  difficulty: string | null;
  hintPlain: string;
};

function clipHint(text: string, max = 300): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** 제출 언어 문자열을 마크다운 코드 펜스 언어 태그로 바꿉니다. */
export function markdownFenceForSubmissionLanguage(language: string): string {
  const raw = language.trim().toLowerCase();
  if (raw.length === 0) return "text";
  const compact = raw.replace(/\s+/g, "");
  const map: Record<string, string> = {
    python: "python",
    py: "python",
    javascript: "javascript",
    js: "javascript",
    typescript: "typescript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    java: "java",
    kotlin: "kotlin",
    kt: "kotlin",
    scala: "scala",
    go: "go",
    golang: "go",
    rust: "javascript",
    rs: "javascript",
    cpp: "cpp",
    "c++": "cpp",
    cxx: "cpp",
    c: "c",
    csharp: "csharp",
    cs: "csharp",
    "c#": "csharp",
    ruby: "ruby",
    rb: "ruby",
    php: "php",
    swift: "swift",
    dart: "dart",
    r: "r",
    sql: "sql",
    shell: "bash",
    bash: "bash",
    sh: "bash",
    zsh: "bash",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    markdown: "markdown",
    md: "markdown",
    perl: "perl",
    lua: "lua",
    haskell: "haskell",
    hs: "haskell",
  };
  if (map[raw] !== undefined) return map[raw];
  if (map[compact] !== undefined) return map[compact];
  const safe = raw.replace(/[^a-z0-9+#-]/g, "");
  return safe.length > 0 ? safe : "text";
}

export function buildAssignmentContextText(context: AssignmentReviewContext): string {
  return [
    `[문제 제목] ${context.title}`,
    `[문제 URL] ${context.problemUrl}`,
    `[플랫폼] ${context.platform}`,
    `[난이도] ${context.difficulty ?? "미기재"}`,
    `[힌트] ${context.hintPlain.trim().length > 0 ? clipHint(context.hintPlain) : "없음"}`,
  ].join("\n");
}
