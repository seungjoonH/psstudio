// 집단 코드 비교 단일 LLM JSON 번들을 파싱·검증하는 유틸입니다.
import { jsonrepair } from "jsonrepair";

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

/** FE·저장소 공통 아티팩트 v2 */
export type CohortArtifactsV2 = {
  schemaVersion: 2;
  submissions: CohortSubmissionArtifactDto[];
};

export type CohortLlmBundleParsed = {
  reportMarkdown: string;
  artifacts: CohortArtifactsV2;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  _targetLanguageKey: string,
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
    if (!Array.isArray(regionsRaw)) {
      throw new Error("cohort_bundle_regions_not_array");
    }

    const lines = countLines(normalizedCode);
    const regions: CohortRegionDto[] = [];

    for (const reg of regionsRaw) {
      if (reg === null || typeof reg !== "object" || Array.isArray(reg)) {
        throw new Error("cohort_bundle_region_invalid");
      }
      const r = reg as Record<string, unknown>;
      const roleId = r.roleId;
      const roleLabel = r.roleLabel;
      const startLine = r.startLine;
      const endLine = r.endLine;
      if (typeof roleId !== "string" || roleId.trim().length === 0) {
        throw new Error("cohort_bundle_role_id_invalid");
      }
      if (typeof roleLabel !== "string" || roleLabel.trim().length === 0) {
        throw new Error("cohort_bundle_role_label_invalid");
      }
      if (typeof startLine !== "number" || typeof endLine !== "number") {
        throw new Error("cohort_bundle_line_not_number");
      }
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
        throw new Error("cohort_bundle_line_not_int");
      }
      if (startLine < 1 || endLine < 1 || startLine > endLine || endLine > lines) {
        throw new Error("cohort_bundle_line_out_of_range");
      }
      regions.push({
        roleId: roleId.trim(),
        roleLabel: roleLabel.trim(),
        startLine,
        endLine,
      });
    }

    submissions.push({
      submissionId,
      normalizedCode: normalizedCode.trim(),
      originalLanguage: originalLanguage.trim(),
      regions,
    });
  }

  if (seenIds.size !== expected.size) {
    throw new Error("cohort_bundle_missing_submission");
  }

  submissions.sort((a, b) => a.submissionId.localeCompare(b.submissionId));

  const artifacts: CohortArtifactsV2 = {
    schemaVersion: 2,
    submissions,
  };

  return {
    reportMarkdown: reportMarkdown.trim(),
    artifacts,
  };
}
