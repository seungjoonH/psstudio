// 집단 코드 비교 단일 LLM JSON 번들을 파싱·검증하는 유틸입니다.
import type { SupportedLanguage } from "@psstudio/shared";
import { SUPPORTED_LANGUAGES } from "@psstudio/shared";
import { jsonrepair } from "jsonrepair";
import { detectLanguage } from "../submissions/language-detect.js";

export type CohortReportLocale = "ko" | "en";

export type CohortRegionDto = {
  roleId: string;
  roleLabel: string;
  startLine: number;
  endLine: number;
};

export type CohortSubmissionArtifactDto = {
  submissionId: string;
  normalizedCode: string;
  originalLanguage: string;
  regions: CohortRegionDto[];
};

/** FE·저장소 공통 아티팩트(JSON에 그대로 저장) */
export type CohortAnalysisArtifactsDto = {
  submissions: CohortSubmissionArtifactDto[];
};

export type CohortLlmBundleParsed = {
  reportMarkdown: string;
  artifacts: CohortAnalysisArtifactsDto;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 이미 삽입된 제출 칩·후속 치환 보호용 */
const CHIP_WRAPPER_RE =
  /\[\[SUBMISSION:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\]\]/gi;

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskSubmissionChips(markdown: string, chipsOut: string[]): string {
  return markdown.replace(CHIP_WRAPPER_RE, (full) => {
    chipsOut.push(full);
    return `\u0000C${chipsOut.length - 1}\u0000`;
  });
}

function unmaskSubmissionChips(markdown: string, chipsOut: string[]): string {
  return markdown.replace(/\u0000C(\d+)\u0000/g, (_, indexStr: string) => {
    const i = Number(indexStr);
    return chipsOut[i] ?? "";
  });
}

/**
 * 리포트 본문에 노출된 제출 UUID를 FE 칩 플레이스홀더로 통일합니다.
 * 기존 [[SUBMISSION:…]] 토큰은 유지하고, 알려진 submissionId에 한해 치환합니다.
 */
export function sanitizeCohortReportMarkdown(markdown: string, submissionIds: string[]): string {
  const uniq = [...new Set(submissionIds.map((id) => id.trim().toLowerCase()))].filter((id) => UUID_RE.test(id));
  let work = markdown;
  for (const id of uniq) {
    const chips: string[] = [];
    let masked = maskSubmissionChips(work, chips);
    const esc = escapeRegexChars(id);
    masked = masked.replace(new RegExp(`submission\\s+${esc}`, "gi"), `[[SUBMISSION:${id}]]`);
    masked = masked.replace(new RegExp(`submission\\s*\\(\\s*${esc}\\s*\\)`, "gi"), `[[SUBMISSION:${id}]]`);
    masked = maskSubmissionChips(masked, chips);
    masked = masked.replace(new RegExp(esc, "gi"), `[[SUBMISSION:${id}]]`);
    work = unmaskSubmissionChips(masked, chips);
  }
  return work;
}

export function normalizeCohortReportLocale(acceptLanguageHeader: string | undefined): CohortReportLocale {
  if (acceptLanguageHeader === undefined || acceptLanguageHeader.trim().length === 0) {
    return "ko";
  }
  const first = acceptLanguageHeader.split(",")[0]?.trim().toLowerCase() ?? "";
  const tag = first.split(";")[0]?.trim() ?? "";
  if (tag.startsWith("ko")) return "ko";
  return "en";
}

function countLines(code: string): number {
  if (code.length === 0) return 1;
  return code.split("\n").length;
}

/** 긴 코드에서 한 줄짜리 구역 남용 방지 기준(이 줄 수 이상이면 구역당 최소 2줄). */
const REGIONS_MIN_LINES_FOR_SPAN_RULE = 12;
const REGIONS_MAX_PER_SUBMISSION = 5;
const REGIONS_MIN_PER_SUBMISSION = 1;
const RESERVED_ROLE_IDS = new Set(["whole_file"]);

/**
 * 모든 제출의 regions가 집단 비교 UI·정책과 맞는지 검증합니다.
 * - 제출당 1~5개, 제출 간 roleId 집합 동일, 예약 roleId 금지, 긴 코드는 구역당 최소 2줄.
 */
export function assertCohortRegionsAligned(submissions: CohortSubmissionArtifactDto[]): void {
  if (submissions.length === 0) return;

  const first = submissions[0];
  if (first === undefined) return;

  const canonical = new Set(first.regions.map((r) => r.roleId));

  for (const sub of submissions) {
    const { regions } = sub;
    if (regions.length < REGIONS_MIN_PER_SUBMISSION || regions.length > REGIONS_MAX_PER_SUBMISSION) {
      throw new Error("cohort_bundle_regions_count");
    }

    const roleIds = regions.map((r) => r.roleId);
    const unique = new Set(roleIds);
    if (unique.size !== roleIds.length) {
      throw new Error("cohort_bundle_regions_duplicate_role");
    }

    for (const id of roleIds) {
      if (RESERVED_ROLE_IDS.has(id)) {
        throw new Error("cohort_bundle_regions_reserved_role");
      }
    }

    const lines = countLines(sub.normalizedCode);
    if (lines >= REGIONS_MIN_LINES_FOR_SPAN_RULE) {
      for (const r of regions) {
        const span = r.endLine - r.startLine + 1;
        if (span < 2) {
          throw new Error("cohort_bundle_regions_too_fine");
        }
      }
    }

    if (unique.size !== canonical.size) {
      throw new Error("cohort_bundle_regions_role_mismatch");
    }
    for (const id of canonical) {
      if (!unique.has(id)) {
        throw new Error("cohort_bundle_regions_role_mismatch");
      }
    }
  }
}

/** TS↔JS, C↔CPP 등 인접 언어는 허용 */
const NORMALIZED_LANGUAGE_COMPATIBLE_BEST: Partial<Record<string, Set<SupportedLanguage>>> = {
  typescript: new Set(["typescript", "javascript", "other"]),
  javascript: new Set(["javascript", "typescript", "other"]),
  cpp: new Set(["cpp", "c", "other"]),
  c: new Set(["c", "cpp", "other"]),
};

/** 다른 언어 흔적이 명백할 때만 거절(짧은 코드도 커버). */
const HARD_LANGUAGE_MARKERS: Record<string, RegExp[]> = {
  python: [
    /\bpublic\s+class\b/,
    /#include\s*[<"]/,
    /\busing\s+namespace\s+std\b/,
    /\bSystem\.out\.println/,
    /\bpublic\s+static\s+void\s+main\s*\(\s*String\[\]/,
  ],
  java: [/^\s*def\s+\w+\s*\(/m, /#include\s*[<"]/, /\busing\s+namespace\s+std\b/, /\bcout\s*<</],
  cpp: [/^\s*def\s+\w+\s*\(/m, /\bpublic\s+static\s+void\s+main\s*\(\s*String\[\]/],
  c: [/^\s*def\s+\w+\s*\(/m, /\bpublic\s+class\b/],
  javascript: [/\bpublic\s+class\b/, /#include\s*[<"]/, /\busing\s+namespace\s+std\b/],
  typescript: [/\bpublic\s+class\b/, /#include\s*[<"]/, /\busing\s+namespace\s+std\b/],
  go: [/^\s*def\s+\w+\s*\(/m, /\bpublic\s+class\b/, /#include\s*[<"]/],
  rust: [/^\s*def\s+\w+\s*\(/m, /\bpublic\s+class\b/, /#include\s*[<"]/],
  kotlin: [/^\s*def\s+\w+\s*\(/m, /#include\s*[<"]/, /\busing\s+namespace\s+std\b/],
  swift: [/^\s*def\s+\w+\s*\(/m, /#include\s*[<"]/, /\bpublic\s+class\b/],
  ruby: [/\bpublic\s+class\b/, /#include\s*[<"]/, /\busing\s+namespace\s+std\b/],
  csharp: [/^\s*def\s+\w+\s*\(/m, /#include\s*[<"]/, /\busing\s+namespace\s+std\b/],
};

/**
 * 그룹 공통 언어(target)로 통일되지 않은 normalizedCode를 걸러낸다.
 * pseudo·detect 미지원 키는 휴리스틱·점수 검사 생략. 애매하면(other) 통과시켜 오탐을 줄인다.
 */
export function assertNormalizedCodeMatchesTargetLanguage(code: string, targetKey: string): void {
  if (targetKey === "pseudo" || targetKey === "none") return;
  const markers = HARD_LANGUAGE_MARKERS[targetKey];
  if (markers !== undefined) {
    for (const re of markers) {
      if (re.test(code)) {
        throw new Error("cohort_bundle_normalized_language_mismatch");
      }
    }
  }
  if (!SUPPORTED_LANGUAGES.includes(targetKey as SupportedLanguage)) return;
  const target = targetKey as SupportedLanguage;
  const { best, scores } = detectLanguage(code);
  const compat = NORMALIZED_LANGUAGE_COMPATIBLE_BEST[targetKey];
  if (compat !== undefined && compat.has(best)) return;
  if (best === target) return;
  if (best === "other") return;
  const bestScore = scores[best];
  const targetScore = scores[target] ?? 0;
  if (bestScore >= 2 && targetScore === 0) {
    throw new Error("cohort_bundle_normalized_language_mismatch");
  }
}

/** 리포트 코드 펜스 태그는 목표 언어와 일치해야 한다(pseudo는 생략). */
const REPORT_FENCE_TAGS_BY_TARGET: Record<string, string[]> = {
  python: ["python"],
  java: ["java"],
  cpp: ["cpp", "c++"],
  c: ["c"],
  javascript: ["javascript", "js"],
  typescript: ["typescript", "ts"],
  go: ["go"],
  rust: ["rust"],
  kotlin: ["kotlin"],
  swift: ["swift"],
  ruby: ["ruby"],
  csharp: ["csharp", "cs"],
};

export function assertReportMarkdownCodeFencesMatchTarget(markdown: string, targetKey: string): void {
  if (targetKey === "pseudo") return;
  const tags = REPORT_FENCE_TAGS_BY_TARGET[targetKey] ?? [targetKey];
  const allowed = new Set(tags.map((t) => t.toLowerCase()));
  const re = /```([^\s`\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const tag = m[1].trim().toLowerCase();
    if (tag.length === 0) continue;
    if (!allowed.has(tag)) {
      throw new Error("cohort_bundle_report_fence_mismatch");
    }
  }
}

/** 통일된 목표 언어 기준 리포트에서 다른 프로그래밍 언어 이름·관용 표현 금지. */
const REPORT_ALIEN_LANG_MARKERS: Array<{ lang: string; re: RegExp }> = [
  { lang: "java", re: /\bJava\b|자바\s*(?:로|에서|언어)/ },
  { lang: "python", re: /\bPython\b|파이썬\s*(?:으로|로|언어)/ },
  { lang: "cpp", re: /\bC\+\+\b|씨플플/ },
  { lang: "javascript", re: /\bJavaScript\b/ },
  { lang: "typescript", re: /\bTypeScript\b/ },
  { lang: "csharp", re: /\bC#\b/ },
  { lang: "go", re: /\bGo\b/ },
  { lang: "rust", re: /\bRust\b/ },
  { lang: "kotlin", re: /\bKotlin\b/ },
  { lang: "swift", re: /\bSwift\b/ },
  { lang: "ruby", re: /\bRuby\b/ },
];

export function assertReportMarkdownUsesUnifiedVoice(markdown: string, targetKey: string): void {
  if (targetKey === "pseudo") return;
  const tsOrJs = targetKey === "typescript" || targetKey === "javascript";
  for (const { lang, re } of REPORT_ALIEN_LANG_MARKERS) {
    if (lang === targetKey) continue;
    if (tsOrJs && (lang === "typescript" || lang === "javascript")) continue;
    if (re.test(markdown)) {
      throw new Error("cohort_bundle_report_original_language_mentioned");
    }
  }
}

function normalizeLineNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function wholeFileRegion(lines: number, locale: CohortReportLocale): CohortRegionDto {
  return {
    roleId: "whole_file",
    roleLabel: locale === "en" ? "Full program" : "코드 전체",
    startLine: 1,
    endLine: lines,
  };
}

/**
 * LLM이 자주 범위를 어기므로 줄 번호를 클램프하고 비었으면 전체 구역 한 개를 둡니다.
 */
export function parseRegionsLenient(
  regionsRaw: unknown,
  normalizedCode: string,
  locale: CohortReportLocale,
): CohortRegionDto[] {
  const lines = countLines(normalizedCode);
  if (!Array.isArray(regionsRaw)) {
    return [wholeFileRegion(lines, locale)];
  }

  const regions: CohortRegionDto[] = [];
  for (const reg of regionsRaw) {
    if (reg === null || typeof reg !== "object" || Array.isArray(reg)) continue;
    const r = reg as Record<string, unknown>;
    const roleId = typeof r.roleId === "string" ? r.roleId.trim() : "";
    const roleLabel = typeof r.roleLabel === "string" ? r.roleLabel.trim() : "";
    const sl = normalizeLineNumber(r.startLine);
    const el = normalizeLineNumber(r.endLine);
    if (roleId.length === 0 || roleLabel.length === 0 || sl === null || el === null) continue;

    let startLine = Math.min(Math.max(sl, 1), lines);
    let endLine = Math.min(Math.max(el, 1), lines);
    if (startLine > endLine) {
      const t = startLine;
      startLine = endLine;
      endLine = t;
    }
    regions.push({ roleId, roleLabel, startLine, endLine });
  }

  if (regions.length === 0) {
    return [wholeFileRegion(lines, locale)];
  }
  return regions;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenced !== null) candidates.push(fenced[1].trim());
  candidates.push(trimmed);
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.length === 0 || seen.has(c)) continue;
    seen.add(c);
    try {
      const obj = JSON.parse(jsonrepair(c)) as unknown;
      if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
        return obj as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * LLM 원문에서 번들을 추출하고, 기대 제출 id 집합과 대상 언어 맥락에 맞게 검증합니다.
 * 실패 시 Error를 throw합니다.
 */
export function parseAndValidateCohortBundle(
  rawLlmText: string,
  expectedSubmissionIdsSorted: string[],
  targetLanguageKey: string,
  reportLocale: CohortReportLocale,
): CohortLlmBundleParsed {
  const obj = parseJsonObject(rawLlmText);
  if (obj === null) {
    throw new Error("cohort_bundle_parse_failed");
  }
  const reportMarkdown = obj.reportMarkdown;
  if (typeof reportMarkdown !== "string" || reportMarkdown.trim().length === 0) {
    throw new Error("cohort_bundle_report_missing");
  }
  const subsRaw = obj.submissions;
  if (!Array.isArray(subsRaw)) {
    throw new Error("cohort_bundle_submissions_not_array");
  }

  const expected = new Set(expectedSubmissionIdsSorted);
  if (subsRaw.length !== expected.size) {
    throw new Error("cohort_bundle_submission_count_mismatch");
  }

  const seenIds = new Set<string>();
  const submissions: CohortSubmissionArtifactDto[] = [];

  for (const item of subsRaw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("cohort_bundle_submission_invalid");
    }
    const row = item as Record<string, unknown>;
    const submissionId = row.submissionId;
    const normalizedCode = row.normalizedCode;
    const originalLanguage = row.originalLanguage;
    const regionsRaw = row.regions;

    if (typeof submissionId !== "string" || !UUID_RE.test(submissionId)) {
      throw new Error("cohort_bundle_submission_id_invalid");
    }
    if (!expected.has(submissionId)) {
      throw new Error("cohort_bundle_unknown_submission");
    }
    if (seenIds.has(submissionId)) {
      throw new Error("cohort_bundle_duplicate_submission");
    }
    seenIds.add(submissionId);

    if (typeof normalizedCode !== "string" || normalizedCode.trim().length === 0) {
      throw new Error("cohort_bundle_code_empty");
    }
    if (typeof originalLanguage !== "string" || originalLanguage.trim().length === 0) {
      throw new Error("cohort_bundle_lang_missing");
    }
    const trimmedCode = normalizedCode.trim();
    assertNormalizedCodeMatchesTargetLanguage(trimmedCode, targetLanguageKey);
    const regions = parseRegionsLenient(regionsRaw, trimmedCode, reportLocale);

    submissions.push({
      submissionId,
      normalizedCode: trimmedCode,
      originalLanguage: originalLanguage.trim(),
      regions,
    });
  }

  if (seenIds.size !== expected.size) {
    throw new Error("cohort_bundle_missing_submission");
  }

  submissions.sort((a, b) => a.submissionId.localeCompare(b.submissionId));

  assertCohortRegionsAligned(submissions);

  const artifacts: CohortAnalysisArtifactsDto = {
    submissions,
  };

  const trimmedMd = reportMarkdown.trim();
  assertReportMarkdownCodeFencesMatchTarget(trimmedMd, targetLanguageKey);
  assertReportMarkdownUsesUnifiedVoice(trimmedMd, targetLanguageKey);
  return {
    reportMarkdown: sanitizeCohortReportMarkdown(trimmedMd, expectedSubmissionIdsSorted),
    artifacts,
  };
}
