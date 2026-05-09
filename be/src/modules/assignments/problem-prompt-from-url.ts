// 문제 URL을 가져와 HTML을 평문으로 바꾼 뒤 제출 AI 리뷰와 동일 규칙으로 요약·입력·출력을 추출합니다.
export type ProblemPromptContext = {
  summary: string;
  input: string;
  output: string;
};

const REVIEW_FETCH_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function clip(text: string, max = 5000): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function pickRandomUserAgent(): string {
  const idx = Math.floor(Math.random() * REVIEW_FETCH_USER_AGENTS.length);
  return REVIEW_FETCH_USER_AGENTS[idx] ?? REVIEW_FETCH_USER_AGENTS[0];
}

function sliceSectionByMarkers(source: string, startMarkers: string[], endMarkers: string[]): string {
  const foundStart = startMarkers
    .map((marker) => ({ marker, idx: source.indexOf(marker) }))
    .filter((item) => item.idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0];
  if (foundStart === undefined) return "";
  const from = source.slice(foundStart.idx + foundStart.marker.length).trim();
  if (from.length === 0) return "";
  let endIdx = from.length;
  for (const marker of endMarkers) {
    const idx = from.indexOf(marker);
    if (idx >= 0) endIdx = Math.min(endIdx, idx);
  }
  return clip(from.slice(0, endIdx).trim(), 1800);
}

function extractProblemPromptContext(plainText: string): ProblemPromptContext | null {
  const normalized = plainText.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  const summaryCandidate = sliceSectionByMarkers(
    normalized,
    ["문제 설명", "문제", "Description", "Problem"],
    ["입력", "Input", "출력", "Output", "제한", "Constraints", "예제", "Examples"],
  );
  const inputCandidate = sliceSectionByMarkers(
    normalized,
    ["입력", "Input"],
    ["출력", "Output", "제한", "Constraints", "예제", "Examples"],
  );
  const outputCandidate = sliceSectionByMarkers(
    normalized,
    ["출력", "Output"],
    ["제한", "Constraints", "예제", "Examples"],
  );
  const summary = summaryCandidate.length > 0 ? summaryCandidate : clip(normalized, 1000);
  const input = inputCandidate.length > 0 ? inputCandidate : "추출 실패";
  const output = outputCandidate.length > 0 ? outputCandidate : "추출 실패";
  return { summary, input, output };
}

/** 제출 AI 리뷰와 동일하게 문제 페이지를 GET 한 뒤 본문을 정제합니다. */
export async function fetchProblemPromptFromUrl(problemUrl: string): Promise<ProblemPromptContext | null> {
  const url = problemUrl.trim();
  if (url.length === 0) return null;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": pickRandomUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const plain = htmlToPlainText(html);
    if (plain.length === 0) return null;
    return extractProblemPromptContext(plain);
  } catch {
    return null;
  }
}
