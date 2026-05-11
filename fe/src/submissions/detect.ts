// 브라우저에서 동작하는 가벼운 언어 추정기입니다. BE의 detectLanguage와 동일한 키워드 표를 사용합니다.
import type { SupportedLanguage } from "@psstudio/shared";

const RULES: Array<{ language: SupportedLanguage; keywords: RegExp[] }> = [
  {
    language: "cpp",
    keywords: [/\b#include\s*<[^>]+>/, /std::[a-zA-Z_]+/, /\bcin\b/, /\bcout\b/],
  },
  {
    language: "c",
    keywords: [/\b#include\s*<[^>]+\.h>/, /\bprintf\s*\(/, /\bscanf\s*\(/, /\bint\s+main\s*\(/],
  },
  {
    language: "java",
    keywords: [/\bpublic\s+class\b/, /\bSystem\.out\.println/, /\bnew\s+Scanner\b/],
  },
  {
    language: "python",
    keywords: [/\bdef\s+\w+\s*\(/, /\bprint\s*\(/, /^\s*import\s+\w+/m, /:\s*$/m],
  },
  {
    language: "typescript",
    keywords: [
      /:\s*(string|number|boolean|any|unknown)\b/,
      /\binterface\s+\w+/,
      /\benum\s+\w+/,
      /\bas\s+(string|number|boolean|const)\b/,
    ],
  },
  {
    language: "javascript",
    keywords: [
      /\bconsole\.log\s*\(/,
      /\bfunction\s+\w+\s*\(/,
      /=>\s*[{(]/,
      /\bmodule\.exports\b/,
    ],
  },
  { language: "go", keywords: [/\bpackage\s+main\b/, /\bfunc\s+\w+\s*\(/, /\bfmt\.Println/] },
];

export function detectLanguageInBrowser(code: string): SupportedLanguage {
  let best: SupportedLanguage = "other";
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const re of rule.keywords) {
      if (re.test(code)) score += rule.language === "typescript" ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.language;
    }
  }
  return best;
}
