// Shiki `codeToHtml`에 넘길 언어 식별자를 정규화합니다.

const LANG_ALIASES: Record<string, string> = {
  py: "python",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cxx: "cpp",
  cs: "csharp",
  csharp: "csharp",
  java: "java",
  kt: "kotlin",
  kotlin: "kotlin",
  go: "go",
  rs: "javascript",
  rust: "javascript",
  rb: "ruby",
  ruby: "ruby",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  shell: "shell",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  sql: "sql",
  diff: "diff",
  other: "txt",
};

export function resolveShikiLanguage(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return "txt";
  }
  const key = raw.trim().toLowerCase();
  return LANG_ALIASES[key] ?? key;
}
