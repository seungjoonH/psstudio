// 집단 비교 리포트 마크다운에서 제출 UUID를 칩 플레이스홀더로 정규화합니다.

/** BE `normalizeCohortReportMarkdownTypography`와 동일. 표시·저장 전 가독성·태그 붙임 보정. */
export function normalizeCohortReportMarkdownTypography(markdown: string): string {
  let w = markdown.replace(/\r\n/g, "\n");
  // 칩 직후 모델이 넣은 HTML 줄바꿈(<br />) — 같은 줄에 한글·코드가 오도록 제거
  w = w.replace(
    /(\[\[SUBMISSION:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\]\])(?:<br\s*\/?\s*>[\s\n]*)+/gi,
    "$1",
  );
  w = w.replace(
    /(\[\[SUBMISSION:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\]\])\s*\n+/gi,
    "$1",
  );
  w = w.replace(
    /(\[\[SUBMISSION:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\]\])\s+(?=[\uAC00-\uD7A3])/gi,
    "$1",
  );
  w = stripCohortReportAsFollowsFillerLines(w);
  return w;
}

/** 펜스 앞 상투구(다음과 같습니다 등) 한 줄 전체 제거 — BE `stripCohortReportAsFollowsFillerLines`와 동일. */
function stripCohortReportAsFollowsFillerLines(markdown: string): string {
  let w = markdown;
  w = w.replace(/^\s*그냥\s+이\s+부분은\s+다음과\s+같습니?다[\.:：]?\s*$/gim, "");
  w = w.replace(/^\s*(그냥\s+)?이\s+부분은\s+다음과\s+같습니?다[\.:：]?\s*$/gim, "");
  w = w.replace(/^\s*코드의\s*일부는\s+다음과\s+같습니?다[\.:：]?\s*$/gim, "");
  w = w.replace(
    /^\s*(?:그냥\s+)?(?:해당\s+)?(?:코드\s+)?발췌(는|가|은|이)\s+다음과\s+같습니?다[\.:：]?\s*$/gim,
    "",
  );
  w = w.replace(/^\s*(?:아래|위의?)\s+코드(는|가|은|이)\s+다음과\s+같습니?다[\.:：]?\s*$/gim, "");
  w = w.replace(/^\s*다음과\s+같습니?다[\.:：]?\s*$/gim, "");
  w = w.replace(/^\s*다음과\s+같다[\.:：]?\s*$/gim, "");
  return w.replace(/\n{3,}/g, "\n\n");
}

/** 칩 렌더 직전에 호출. BE 저장 정규화와 동일 규칙. */
export function prepareCohortReportMarkdownForDisplay(markdown: string): string {
  return normalizeCohortReportMarkdownTypography(markdown);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** BE `stripCohortBoilerplateHeadingLines`와 동일. */
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

/** BE `stripCohortSubmissionSummarySection`와 동일. */
function stripCohortSubmissionSummarySection(markdown: string): string {
  let w = markdown.replace(/\r\n/g, "\n");
  w = w
    .replace(/(^|\n)##\s+제출\s*요약[^\n]*\n([\s\S]*?)(?=\n##\s|$)/g, "$1")
    .replace(/(^|\n)##\s+Submission\s+summary[^\n]*\n([\s\S]*?)(?=\n##\s|$)/gi, "$1");
  w = stripCohortBoilerplateHeadingLines(w);
  return w.replace(/\n{3,}/g, "\n\n").trim();
}

/** BE `sanitizeCohortReportMarkdown`와 동일 규칙(구 저장본 마크다운 보정용). */
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
