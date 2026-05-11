// 제출 코드 줄 배열에서 블록 주석(/* … */)만 단색 처리할 줄 인덱스를 계산합니다(줄 단위 Shiki 보정용).

/**
 * 같은 줄에 코드와 `/*`가 섞인 경우는 마스크하지 않고 Shiki에 맡긴다.
 * 멀티라인 블록만 줄 단위로 통일 색을 쓴다.
 */
export function computeJsTsBlockCommentLineMask(lines: string[]): boolean[] {
  const mask = lines.map(() => false);
  let inBlock = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";

    if (inBlock) {
      mask[li] = true;
      if (line.includes("*/")) {
        inBlock = false;
      }
      continue;
    }

    const openIdx = line.indexOf("/*");
    if (openIdx === -1) continue;

    const beforeOpen = line.slice(0, openIdx).trim();
    const hasClose = line.includes("*/");

    if (beforeOpen.length > 0) {
      if (!hasClose) {
        inBlock = true;
      }
      continue;
    }

    mask[li] = true;
    if (!hasClose) {
      inBlock = true;
    }
  }

  return mask;
}
