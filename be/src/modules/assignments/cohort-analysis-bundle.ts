// 집단 코드 비교 단일 LLM JSON 번들을 파싱·검증하는 유틸입니다.
import { jsonrepair } from "jsonrepair";

export type CohortReportLocale = "ko" | "en";

export type CohortRegionDto = {
  roleId: string;
  roleLabel: string;
  startLine: number;
  endLine: number;
};

/** 저장소·API에 남는 제출별 아티팩트(LLM은 regions만 생성, 코드는 DB 스냅샷). */
export type CohortSubmissionArtifactDto = {
  submissionId: string;
  regions: CohortRegionDto[];
};

/** FE·저장소 공통 아티팩트(JSON에 그대로 저장) */
export type CohortAnalysisArtifactsDto = {
  submissions: CohortSubmissionArtifactDto[];
};

/** 조회 시 제출 버전 코드·언어를 붙인 응답용 아티팩트 */
export type CohortSubmissionArtifactPublicDto = CohortSubmissionArtifactDto & {
  code: string;
  language: string;
};

export type CohortAnalysisArtifactsPublicDto = {
  submissions: CohortSubmissionArtifactPublicDto[];
};

export type CohortLlmBundleParsed = {
  reportMarkdown: string;
  artifacts: CohortAnalysisArtifactsDto;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeCohortReportMarkdown(markdown: string, submissionIds: string[]): string {
  void submissionIds;
  return markdown;
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

/** DB 스냅샷 원문 → 줄 배열. 집단 LLM 입력·클램프 검증과 동일 규칙이며 빈 줄은 `""`로 유지합니다(JavaScript `String.prototype.split`). */
export function cohortSubmissionLinesFromSource(code: string): string[] {
  if (code.length === 0) return [""];
  return code.split("\n");
}

/** 긴 코드에서 한 줄짜리 구역 남용 방지 기준(이 줄 수 이상이면 구역당 최소 2줄). */
const REGIONS_MIN_LINES_FOR_SPAN_RULE = 12;
const REGIONS_MAX_PER_SUBMISSION = 5;
const REGIONS_MIN_PER_SUBMISSION = 1;
const RESERVED_ROLE_IDS = new Set(["whole_file"]);

function sortRegionsByLine(regions: CohortRegionDto[]): void {
  regions.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

/**
 * 모든 제출의 regions가 집단 비교 UI·정책과 맞는지 검증합니다.
 * - 제출당 1~5개, 예약 roleId 금지, 긴 코드는 구역당 최소 2줄.
 * - 제출마다 `roleId` 집합·구역 개수는 달라도 된다.
 * - 줄 번호는 각 제출의 DB 원문 코드(codeBySubmissionId) 기준입니다.
 */
export function assertCohortRegionsAligned(
  submissions: CohortSubmissionArtifactDto[],
  codeBySubmissionId: ReadonlyMap<string, string>,
): void {
  if (submissions.length === 0) return;

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

    const code = codeBySubmissionId.get(sub.submissionId) ?? "";
    const lines = countLines(code);
    if (lines >= REGIONS_MIN_LINES_FOR_SPAN_RULE) {
      for (const r of regions) {
        const span = r.endLine - r.startLine + 1;
        if (span < 2) {
          throw new Error("cohort_bundle_regions_too_fine");
        }
      }
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
    roleId: "entire_code",
    roleLabel: locale === "en" ? "Full program" : "코드 전체",
    startLine: 1,
    endLine: lines,
  };
}

function normalizeAnchorText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value.replace(/\r\n/g, "\n").trim();
  if (text.length === 0) return null;
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced !== null) {
    text = fenced[1].trim();
  }
  return text.length > 0 ? text : null;
}

function trimBlankEdgeLines(lines: string[]): string[] {
  let s = 0;
  let e = lines.length - 1;
  while (s <= e && lines[s]?.trim().length === 0) s += 1;
  while (e >= s && lines[e]?.trim().length === 0) e -= 1;
  return s <= e ? lines.slice(s, e + 1) : [];
}

function findContiguousAnchorRange(sourceLines: string[], anchorText: string): { startLine: number; endLine: number } | null {
  const anchorLines = trimBlankEdgeLines(anchorText.split("\n"));
  if (anchorLines.length === 0) return null;
  const n = sourceLines.length;
  const m = anchorLines.length;
  if (m > n) return null;

  const eq = (a: string, b: string) => a === b;
  const eqTrim = (a: string, b: string) => a.trim() === b.trim();

  const tryMatch = (cmp: (a: string, b: string) => boolean): { startLine: number; endLine: number } | null => {
    for (let i = 0; i <= n - m; i += 1) {
      let ok = true;
      for (let j = 0; j < m; j += 1) {
        const src = sourceLines[i + j];
        const anc = anchorLines[j];
        if (src === undefined || anc === undefined || !cmp(src, anc)) {
          ok = false;
          break;
        }
      }
      if (ok) return { startLine: i + 1, endLine: i + m };
    }
    return null;
  };

  return tryMatch(eq) ?? tryMatch(eqTrim);
}

/** 긴 코드에서 구역당 최소 2줄 규칙을 맞추기 위해 한 줄짜리 범위를 안전하게 확장합니다. */
function expandSingleLineRegionForMinSpan(
  startLine: number,
  endLine: number,
  totalLines: number,
): { startLine: number; endLine: number } {
  if (totalLines < REGIONS_MIN_LINES_FOR_SPAN_RULE) {
    return { startLine, endLine };
  }
  const span = endLine - startLine + 1;
  if (span >= 2) {
    return { startLine, endLine };
  }
  let s = startLine;
  let e = endLine;
  if (e < totalLines) {
    e += 1;
  } else if (s > 1) {
    s -= 1;
  }
  return { startLine: s, endLine: e };
}

/**
 * 원문이 충분히 긴데 한 구역만 두거나 `entire_code`로 전체를 덮으면 집단 비교 UI가 무의미해집니다.
 */
function assertSemanticRegionsRequiredForLongFiles(regions: CohortRegionDto[], sourceCode: string): void {
  const lines = countLines(sourceCode);
  if (lines < REGIONS_MIN_LINES_FOR_SPAN_RULE) return;

  if (regions.length < 2) {
    throw new Error("cohort_bundle_regions_semantic_required");
  }
  for (const r of regions) {
    if (r.roleId === "entire_code") {
      throw new Error("cohort_bundle_regions_semantic_required");
    }
  }
}

/**
 * LLM이 자주 범위를 어기므로 줄 번호를 클램프하고 비었으면 전체 구역 한 개를 둡니다.
 */
export function parseRegionsLenient(
  regionsRaw: unknown,
  sourceCode: string,
  locale: CohortReportLocale,
): CohortRegionDto[] {
  const lines = countLines(sourceCode);
  if (!Array.isArray(regionsRaw)) {
    return [wholeFileRegion(lines, locale)];
  }

  const regions: CohortRegionDto[] = [];
  const sourceLines = cohortSubmissionLinesFromSource(sourceCode);
  for (const reg of regionsRaw) {
    if (reg === null || typeof reg !== "object" || Array.isArray(reg)) continue;
    const r = reg as Record<string, unknown>;
    const roleId = typeof r.roleId === "string" ? r.roleId.trim() : "";
    const roleLabel = typeof r.roleLabel === "string" ? r.roleLabel.trim() : "";
    if (roleId.length === 0 || roleLabel.length === 0) continue;

    const startAnchor = normalizeAnchorText(r.startAnchorText ?? r.startAnchor);
    const endAnchor = normalizeAnchorText(r.endAnchorText ?? r.endAnchor);

    let startLine: number;
    let endLine: number;
    let resolvedByAnchor = false;

    if (startAnchor !== null || endAnchor !== null) {
      resolvedByAnchor = true;
      if (startAnchor !== null && endAnchor !== null) {
        const startRange = findContiguousAnchorRange(sourceLines, startAnchor);
        const endRange = findContiguousAnchorRange(sourceLines, endAnchor);
        if (startRange === null || endRange === null) {
          throw new Error("cohort_bundle_anchor_not_found");
        }
        startLine = startRange.startLine;
        endLine = endRange.endLine;
      } else if (startAnchor !== null) {
        const startRange = findContiguousAnchorRange(sourceLines, startAnchor);
        if (startRange === null) {
          throw new Error("cohort_bundle_anchor_not_found");
        }
        startLine = startRange.startLine;
        endLine = startRange.endLine;
      } else {
        if (endAnchor === null) {
          throw new Error("cohort_bundle_anchor_not_found");
        }
        const endRange = findContiguousAnchorRange(sourceLines, endAnchor);
        if (endRange === null) {
          throw new Error("cohort_bundle_anchor_not_found");
        }
        startLine = endRange.startLine;
        endLine = endRange.endLine;
      }
    } else {
      const sl = normalizeLineNumber(r.startLine);
      const el = normalizeLineNumber(r.endLine);
      if (sl === null || el === null) continue;
      startLine = sl;
      endLine = el;
    }

    startLine = Math.min(Math.max(startLine, 1), lines);
    endLine = Math.min(Math.max(endLine, 1), lines);
    if (startLine > endLine) {
      const t = startLine;
      startLine = endLine;
      endLine = t;
    }
    if (resolvedByAnchor) {
      const expanded = expandSingleLineRegionForMinSpan(startLine, endLine, lines);
      startLine = expanded.startLine;
      endLine = expanded.endLine;
      startLine = Math.min(Math.max(startLine, 1), lines);
      endLine = Math.min(Math.max(endLine, 1), lines);
      if (startLine > endLine) {
        const t = startLine;
        startLine = endLine;
        endLine = t;
      }
    }
    regions.push({ roleId, roleLabel, startLine, endLine });
  }

  if (regions.length === 0) {
    return [wholeFileRegion(lines, locale)];
  }
  return regions;
}

/**
 * 모델이 `submissions`를 배열 대신 `{ [submissionId]: { regions } }` 객체로 줄 때 배열로 정규화합니다.
 * 키는 모두 UUID 형식이고 값은 regions를 가진 객체만 허용합니다.
 */
function coerceSubmissionsToArray(subsRaw: unknown): unknown[] | null {
  if (Array.isArray(subsRaw)) {
    return subsRaw;
  }
  if (subsRaw === null || typeof subsRaw !== "object") {
    return null;
  }
  const o = subsRaw as Record<string, unknown>;
  const entries = Object.entries(o);
  if (entries.length === 0) {
    return null;
  }
  const out: unknown[] = [];
  for (const [k, v] of entries) {
    if (!UUID_RE.test(k)) {
      return null;
    }
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return null;
    }
    const row = v as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(row, "regions")) {
      return null;
    }
    out.push({ submissionId: k, regions: row.regions });
  }
  return out;
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
 * LLM 원문에서 번들을 추출하고, 기대 제출 id 집합과 DB 원문 코드 줄 범위에 맞게 검증합니다.
 * 실패 시 Error를 throw합니다.
 */
export function parseAndValidateCohortBundle(
  rawLlmText: string,
  expectedSubmissionIdsSorted: string[],
  codeBySubmissionId: ReadonlyMap<string, string>,
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
  const subsArray = coerceSubmissionsToArray(obj.submissions);
  if (subsArray === null) {
    throw new Error("cohort_bundle_submissions_not_array");
  }

  const expected = new Set(expectedSubmissionIdsSorted);
  if (subsArray.length !== expected.size) {
    throw new Error("cohort_bundle_submission_count_mismatch");
  }

  const seenIds = new Set<string>();
  const submissions: CohortSubmissionArtifactDto[] = [];

  for (const item of subsArray) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("cohort_bundle_submission_invalid");
    }
    const row = item as Record<string, unknown>;
    const submissionId = row.submissionId;
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

    const code = codeBySubmissionId.get(submissionId);
    if (code === undefined || code.trim().length === 0) {
      throw new Error("cohort_bundle_code_empty");
    }
    /** 줄 번호는 LLM 입력 `lines`(cohortSubmissionLinesFromSource·원문 split)와 동일해야 한다. `trim()`하면 마지막 줄바꿈 등으로 N이 줄어들어 구역이 전부 어긋난다. */
    const regions = parseRegionsLenient(regionsRaw, code, reportLocale);
    assertSemanticRegionsRequiredForLongFiles(regions, code);

    submissions.push({
      submissionId,
      regions,
    });
  }

  if (seenIds.size !== expected.size) {
    throw new Error("cohort_bundle_missing_submission");
  }

  const orderIdx = new Map(expectedSubmissionIdsSorted.map((id, i) => [id.toLowerCase(), i]));
  submissions.sort((a, b) => {
    const ia = orderIdx.get(a.submissionId.toLowerCase()) ?? 0;
    const ib = orderIdx.get(b.submissionId.toLowerCase()) ?? 0;
    return ia - ib || a.submissionId.localeCompare(b.submissionId);
  });

  for (const sub of submissions) {
    sortRegionsByLine(sub.regions);
  }
  assertCohortRegionsAligned(submissions, codeBySubmissionId);

  const artifacts: CohortAnalysisArtifactsDto = {
    submissions,
  };

  return {
    reportMarkdown: sanitizeCohortReportMarkdown(reportMarkdown, expectedSubmissionIdsSorted),
    artifacts,
  };
}
