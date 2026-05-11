// LLM 본문의 흔한 마크다운 비호환 패턴을 GFM 파서에 맞게 정리합니다.

/** 펜스 줄만 있는 경우(앞에 공백 최대 3칸만 허용)입니다. GFM과 동일합니다. */
function isFenceOnlyLine(line: string): boolean {
  return /^\s{0,3}```/.test(line);
}

/** 같은 줄에 삽입된 펜스 시작(예: "패치 예시: ```javascript")을 별도 줄로 분리합니다. */
function splitFenceGluedToProse(line: string): string[] {
  if (isFenceOnlyLine(line)) return [line];

  const idx = line.indexOf("```");
  if (idx <= 0) return [line];

  const before = line.slice(0, idx);
  if (before.trim().length === 0) return [line];

  const after = line.slice(idx);
  return [before.trimEnd(), "", after];
}

/**
 * 모델이 프롬프트대로 `<br />`를 쓰면서도 ATX 제목·펜스 블록이 깨지는 경우를 줄입니다.
 * - `<br />` → GFM/CommonMark **하드 줄바꿈**(`  \n`, 줄 끝 공백 두 칸 + 줄바꿈)으로 바꿔 같은 문단 안에서도 `<br>` 렌더가 나오게 함(단일 `\n`만 두면 소프트 브레이크로 공백 처리되는 경우가 많음)
 * - 본문과 같은 줄의 ``` 펜스 시작 → 앞 문장과 분리
 */
export function normalizeLlmMarkdown(source: string): string {
  let s = source.replace(/\r\n/g, "\n");
  s = s.replace(/<br\s*\/?>/gi, "  \n");

  const lines = s.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const parts = splitFenceGluedToProse(line);
    out.push(...parts);
  }
  return out.join("\n");
}
