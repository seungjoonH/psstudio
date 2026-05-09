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

/** LLM이 자주 쓰는 빈 꼭지 `##` 한 줄만 제거합니다(본문은 유지). */
function stripCohortBoilerplateHeadingLines(markdown: string): string {
  return markdown
    .replace(/^##\s+제출\s*간\s*비교\s*개요\s*$/gim, "")
    .replace(/^##\s+문제\s*요약과\s*목표\s*$/gim, "")
    .replace(/^##\s+문제\s*요약[^\n]*$/gim, "")
    .replace(/^##\s+비교\s*개요\s*$/gim, "")
    .replace(/^##\s*요약\s*$/gim, "")
    .replace(/^##\s+Cross-submission\s+overview[^\n]*$/gim, "")
    .replace(/^##\s+Problem\s+summary[^\n]*$/gim, "")
    .replace(/^##\s+Submission\s+overview[^\n]*$/gim, "")
    .replace(/^##\s+Summary\s*$/gim, "")
    .replace(/^##\s+Overview\s*$/gim, "")
    .replace(/^##\s+마무리\s*$/gim, "")
    .replace(/^##\s+Closing\s*$/gim, "")
    .replace(/^##\s+Conclusion\s*$/gim, "");
}

/** 한국어 가독성·태그 직후 조사 붙임 등 리포트 마크다운을 저장 전에 보정합니다(FE `normalizeCohortReportMarkdownTypography`와 동일). */
function normalizeCohortReportMarkdownTypography(markdown: string): string {
  let w = markdown.replace(/\r\n/g, "\n");
  w = w.replace(
    /(\[\[SUBMISSION:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\]\])\s*\n+/gi,
    "$1",
  );
  w = w.replace(
    /(\[\[SUBMISSION:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\]\])\s+(?=[\uAC00-\uD7A3])/gi,
    "$1",
  );
  w = w.replace(/다음과\s+같습니다\s*:/g, "다음과 같습니다.");
  w = w.replace(/다음과\s+같다\s*:/g, "다음과 같다.");
  return w;
}

/**
 * LLM이 구 스타일로 붙이는 "제출 요약" 절(화면에 별도 목록이 있을 때 쓰이던 형식)을 제거합니다.
 */
function stripCohortSubmissionSummarySection(markdown: string): string {
  let w = markdown.replace(/\r\n/g, "\n");
  w = w
    .replace(/(^|\n)##\s+제출\s*요약[^\n]*\n([\s\S]*?)(?=\n##\s|$)/g, "$1")
    .replace(/(^|\n)##\s+Submission\s+summary[^\n]*\n([\s\S]*?)(?=\n##\s|$)/gi, "$1");
  w = stripCohortBoilerplateHeadingLines(w);
  return w.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 리포트 본문에 노출된 제출 UUID를 FE 칩 플레이스홀더로 통일합니다.
 * 기존 [[SUBMISSION:…]] 토큰은 유지하고, 알려진 submissionId에 한해 치환합니다.
 */
export function sanitizeCohortReportMarkdown(markdown: string, submissionIds: string[]): string {
  const uniq = [...new Set(submissionIds.map((id) => id.trim().toLowerCase()))].filter((id) => UUID_RE.test(id));
  let work = stripCohortSubmissionSummarySection(markdown);
  work = normalizeCohortReportMarkdownTypography(work);
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

function sortRegionsByLine(regions: CohortRegionDto[]): void {
  regions.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

/** 문서 순서로 인접한 두 구역 중 병합 비용(줄 간격)이 가장 작은 쌍을 합칩니다. */
function mergeClosestAdjacentPair(regions: CohortRegionDto[]): void {
  sortRegionsByLine(regions);
  if (regions.length < 2) {
    throw new Error("cohort_bundle_regions_role_mismatch");
  }
  let bestI = 0;
  let bestGap = Infinity;
  for (let i = 0; i < regions.length - 1; i += 1) {
    const a = regions[i];
    const b = regions[i + 1];
    if (a === undefined || b === undefined) continue;
    const gap = b.startLine - a.endLine - 1;
    const score = gap < 0 ? 0 : gap;
    if (score < bestGap) {
      bestGap = score;
      bestI = i;
    }
  }
  const a = regions[bestI];
  const b = regions[bestI + 1];
  if (a === undefined || b === undefined) {
    throw new Error("cohort_bundle_regions_role_mismatch");
  }
  regions[bestI] = {
    roleId: a.roleId,
    roleLabel: `${a.roleLabel} · ${b.roleLabel}`,
    startLine: Math.min(a.startLine, b.startLine),
    endLine: Math.max(a.endLine, b.endLine),
  };
  regions.splice(bestI + 1, 1);
}

/**
 * 긴 코드에서는 구역당 최소 줄 수를 지키며 가장 긴 구역을 둘로 나눕니다.
 * @returns 분할 성공 여부
 */
function splitLargestSplittableRegion(regions: CohortRegionDto[], totalLines: number): boolean {
  const minPiece = totalLines >= REGIONS_MIN_LINES_FOR_SPAN_RULE ? 2 : 1;
  sortRegionsByLine(regions);
  let bestIdx = -1;
  let bestSpan = -1;
  for (let i = 0; i < regions.length; i += 1) {
    const r = regions[i];
    if (r === undefined) continue;
    const span = r.endLine - r.startLine + 1;
    if (span >= minPiece * 2 && span > bestSpan) {
      bestSpan = span;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return false;
  const r = regions[bestIdx];
  if (r === undefined) return false;
  const leftEnd = r.startLine + minPiece - 1;
  const rightStart = leftEnd + 1;
  if (rightStart > r.endLine) return false;
  if (r.endLine - rightStart + 1 < minPiece) return false;
  const left: CohortRegionDto = {
    roleId: `${r.roleId}_a`,
    roleLabel: `${r.roleLabel} (앞)`,
    startLine: r.startLine,
    endLine: leftEnd,
  };
  const right: CohortRegionDto = {
    roleId: `${r.roleId}_b`,
    roleLabel: `${r.roleLabel} (뒤)`,
    startLine: rightStart,
    endLine: r.endLine,
  };
  regions.splice(bestIdx, 1, left, right);
  return true;
}

/**
 * LLM이 제출마다 구역 개수를 다르게 주는 경우, submissionId 정렬 **첫 제출**의 개수 k에 맞춰
 * 나머지 제출의 regions를 병합(많을 때)·분할(적을 때)해 맞춥니다.
 * 맞출 수 없으면 cohort_bundle_regions_role_mismatch.
 */
export function normalizeSubmissionRegionCountsToHeadTemplate(
  submissions: CohortSubmissionArtifactDto[],
  codeBySubmissionId: ReadonlyMap<string, string>,
): void {
  if (submissions.length === 0) return;
  const targetK = submissions[0].regions.length;

  for (const sub of submissions) {
    const raw = codeBySubmissionId.get(sub.submissionId) ?? "";
    const code = raw.trim();
    const totalLines = countLines(code);

    while (sub.regions.length > targetK) {
      mergeClosestAdjacentPair(sub.regions);
    }
    while (sub.regions.length < targetK) {
      const ok = splitLargestSplittableRegion(sub.regions, totalLines);
      if (!ok) {
        throw new Error("cohort_bundle_regions_role_mismatch");
      }
    }
  }
}

/**
 * 구역을 시작 줄 기준으로 정렬한 뒤, submissionId 정렬상 첫 제출의 슬롯별 roleId·roleLabel로 나머지 제출을 맞춥니다.
 * (LLM이 이름만 다르게 준 경우 색·축을 맞추기 위한 정규화.)
 */
export function canonicalizeCohortRegionsBySlot(submissions: CohortSubmissionArtifactDto[]): void {
  if (submissions.length === 0) return;

  for (const sub of submissions) {
    sortRegionsByLine(sub.regions);
  }

  const head = submissions[0];
  if (head === undefined) return;

  const k = head.regions.length;
  for (const sub of submissions) {
    if (sub.regions.length !== k) {
      throw new Error("cohort_bundle_regions_role_mismatch");
    }
  }

  const template = head.regions;
  for (let s = 1; s < submissions.length; s += 1) {
    const sub = submissions[s];
    if (sub === undefined) continue;
    for (let i = 0; i < k; i += 1) {
      const t = template[i];
      const r = sub.regions[i];
      if (t === undefined || r === undefined) continue;
      r.roleId = t.roleId;
      r.roleLabel = t.roleLabel;
    }
  }
}

/**
 * 모든 제출의 regions가 집단 비교 UI·정책과 맞는지 검증합니다.
 * - 제출당 1~5개, 제출 간 roleId 집합 동일, 예약 roleId 금지, 긴 코드는 구역당 최소 2줄.
 * - 줄 번호는 각 제출의 DB 원문 코드(codeBySubmissionId) 기준입니다.
 */
export function assertCohortRegionsAligned(
  submissions: CohortSubmissionArtifactDto[],
  codeBySubmissionId: ReadonlyMap<string, string>,
): void {
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
    const trimmedCode = code.trim();
    const regions = parseRegionsLenient(regionsRaw, trimmedCode, reportLocale);
    assertSemanticRegionsRequiredForLongFiles(regions, trimmedCode);

    submissions.push({
      submissionId,
      regions,
    });
  }

  if (seenIds.size !== expected.size) {
    throw new Error("cohort_bundle_missing_submission");
  }

  submissions.sort((a, b) => a.submissionId.localeCompare(b.submissionId));

  normalizeSubmissionRegionCountsToHeadTemplate(submissions, codeBySubmissionId);
  canonicalizeCohortRegionsBySlot(submissions);
  assertCohortRegionsAligned(submissions, codeBySubmissionId);

  const artifacts: CohortAnalysisArtifactsDto = {
    submissions,
  };

  const trimmedMd = reportMarkdown.trim();
  return {
    reportMarkdown: sanitizeCohortReportMarkdown(trimmedMd, expectedSubmissionIdsSorted),
    artifacts,
  };
}
