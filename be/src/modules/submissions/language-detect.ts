// 코드 텍스트에서 언어를 키워드 기반으로 추정합니다.
import type { SupportedLanguage } from "@psstudio/shared";
import { SUPPORTED_LANGUAGES } from "@psstudio/shared";

type Rule = {
  language: SupportedLanguage;
  keywords: RegExp[];
};

const RULES: Rule[] = [
  {
    language: "cpp",
    keywords: [/\b#include\s*<[^>]+>/, /std::[a-zA-Z_]+/, /\bcin\b/, /\bcout\b/, /->/, /->/],
  },
  {
    language: "c",
    keywords: [/\b#include\s*<[^>]+\.h>/, /\bprintf\s*\(/, /\bscanf\s*\(/, /\bint\s+main\s*\(/],
  },
  {
    language: "java",
    keywords: [/\bpublic\s+class\b/, /\bSystem\.out\.println/, /\bnew\s+Scanner\b/, /\bString\[\]\s+args\b/],
  },
  {
    language: "python",
    keywords: [/\bdef\s+\w+\s*\(/, /\bprint\s*\(/, /^\s*import\s+\w+/m, /:\s*$/m, /\bif\s+__name__\s*==\s*['"]__main__['"]/],
  },
  {
    language: "typescript",
    keywords: [
      /:\s*(string|number|boolean|any|unknown)\b/,
      /\binterface\s+\w+/,
      /\benum\s+\w+/,
      /\bas\s+(string|number|boolean|const)\b/,
      /\bexport\s+(type|interface)\b/,
    ],
  },
  {
    language: "javascript",
    keywords: [
      /\bconsole\.log\s*\(/,
      /\bfunction\s+\w+\s*\(/,
      /=>\s*[{(]/,
      /\bmodule\.exports\b/,
      /\brequire\s*\(/,
    ],
  },
  {
    language: "go",
    keywords: [/\bpackage\s+main\b/, /\bfunc\s+\w+\s*\(/, /\bfmt\.Println\s*\(/],
  },
  {
    language: "kotlin",
    keywords: [/\bfun\s+main\s*\(/, /\bval\s+\w+\s*=/, /\bprintln\s*\(/],
  },
  {
    language: "swift",
    keywords: [/\bfunc\s+\w+\s*\(/, /\bvar\s+\w+\s*:/, /\bprint\s*\(/],
  },
  {
    language: "ruby",
    keywords: [/\bdef\s+\w+/, /\bputs\s+/, /\bend\b/],
  },
  {
    language: "csharp",
    keywords: [/\busing\s+System;/, /\bnamespace\s+\w+/, /\bConsole\.WriteLine/, /\bpublic\s+static\s+void\s+Main/],
  },
];

export type LanguageGuess = {
  best: SupportedLanguage;
  scores: Record<SupportedLanguage, number>;
};

export function detectLanguage(code: string): LanguageGuess {
  const scores: Record<string, number> = Object.fromEntries(
    SUPPORTED_LANGUAGES.map((l) => [l, 0]),
  );
  // TS 타입 표기가 한 번이라도 등장하면 TS 가중치를 더 줘서 JS와 명확히 구분한다.
  const TS_WEIGHT = 2;
  for (const rule of RULES) {
    for (const re of rule.keywords) {
      if (re.test(code)) {
        scores[rule.language] += rule.language === "typescript" ? TS_WEIGHT : 1;
      }
    }
  }
  let best: SupportedLanguage = "other";
  let bestScore = 0;
  for (const rule of RULES) {
    const s = scores[rule.language];
    if (s > bestScore) {
      bestScore = s;
      best = rule.language;
    }
  }
  return { best, scores: scores as Record<SupportedLanguage, number> };
}
