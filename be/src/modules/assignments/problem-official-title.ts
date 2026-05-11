// 문제 페이지 HTML에서 플랫폼별 공식 제목을 추출합니다(LLM 요약 제목 대신 사용).
import type { ProblemPlatform } from "@psstudio/shared";

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripNoise(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length === 0) return "";
  if (/^(네트워크|로그인|javascript)/i.test(t)) return "";
  return t;
}

/** 프로그래머스 스쿨 알고리즘 문제 페이지 */
export function extractProgrammersOfficialTitle(html: string): string {
  if (html.length === 0) return "";

  const dataLesson = html.match(/data-lesson-title="([^"]*)"/i);
  if (dataLesson !== null) {
    const s = stripNoise(decodeHtmlEntities(dataLesson[1]));
    if (s.length > 0) return s;
  }

  const challengeSpan = html.match(
    /<span[^>]*class="[^"]*\bchallenge-title\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );
  if (challengeSpan !== null) {
    const inner = challengeSpan[1].replace(/<[^>]+>/g, "").trim();
    const s = stripNoise(decodeHtmlEntities(inner));
    if (s.length > 0) return s;
  }

  const og = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (og !== null) {
    const raw = decodeHtmlEntities(og[1]);
    const pipe = raw.split("|")[0]?.trim() ?? "";
    const dash = pipe.match(/(?:코딩테스트 연습|프로그래머스)\s*-\s*(.+)$/i);
    const fromOg = stripNoise(dash !== null ? dash[1].trim() : pipe);
    if (fromOg.length > 0 && !/^프로그래머스/i.test(fromOg)) return fromOg;
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag !== null) {
    const raw = decodeHtmlEntities(titleTag[1].replace(/<[^>]+>/g, " "));
    const segment = raw.split("|")[0]?.trim() ?? raw;
    const school = segment.match(/-\s*([^-|]+)\s*$/);
    const challenge = segment.match(/코딩테스트 연습\s*-\s*(.+)/i);
    const candidate = stripNoise(
      challenge !== null ? challenge[1].trim() : school !== null ? school[1].trim() : segment,
    );
    if (
      candidate.length > 0 &&
      !/^프로그래머스\s*스쿨$/i.test(candidate) &&
      !/^코딩테스트 연습$/i.test(candidate)
    ) {
      return candidate;
    }
  }

  return "";
}

/** 백준(구.acmicpc.net) 문제 페이지 */
export function extractBojOfficialTitle(html: string): string {
  if (html.length === 0) return "";

  const probSpan =
    html.match(/id=["']problem_title["'][^>]*>([\s\S]*?)<\//i) ??
    html.match(/<span[^>]*id=["']problem_title["'][^>]*>([\s\S]*?)<\/span>/i);
  if (probSpan !== null) {
    const inner = probSpan[1].replace(/<[^>]+>/g, "").trim();
    const s = stripNoise(decodeHtmlEntities(inner));
    if (s.length > 0) return s;
  }

  const og = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (og !== null) {
    const raw = decodeHtmlEntities(og[1]);
    const noBo = raw.replace(/\s*-\s*백준(?:온라인 저지)?\s*$/i, "").trim();
    const s = stripNoise(noBo);
    if (s.length > 0) return s;
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag !== null) {
    const raw = decodeHtmlEntities(titleTag[1].replace(/<[^>]+>/g, " "));
    const m = raw.match(/\d+\s*번\s*-\s*(.+?)(?:\s*-\s*백준|$)/i);
    if (m !== null) {
      const s = stripNoise(m[1]);
      if (s.length > 0) return s;
    }
    const s = stripNoise(raw.split("-")[0]?.trim() ?? "");
    if (s.length > 0 && /번/.test(s)) return s;
  }

  return "";
}

/** LeetCode 문제 페이지 */
export function extractLeetCodeOfficialTitle(html: string): string {
  if (html.length === 0) return "";

  const og = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (og !== null) {
    const raw = decodeHtmlEntities(og[1]);
    const main = raw.replace(/\s*-\s*LeetCode(?:\s*\|\s*.*)?$/i, "").trim();
    const s = stripNoise(main);
    if (s.length > 0) return s;
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag !== null) {
    const raw = decodeHtmlEntities(titleTag[1].replace(/<[^>]+>/g, " "));
    const main = raw.replace(/\s*-\s*LeetCode.*$/i, "").trim();
    const s = stripNoise(main);
    if (s.length > 0) return s;
  }

  return "";
}

export function extractOfficialProblemTitle(platform: ProblemPlatform, html: string): string {
  switch (platform) {
    case "Programmers":
      return extractProgrammersOfficialTitle(html);
    case "BOJ":
      return extractBojOfficialTitle(html);
    case "LeetCode":
      return extractLeetCodeOfficialTitle(html);
    default:
      return "";
  }
}
