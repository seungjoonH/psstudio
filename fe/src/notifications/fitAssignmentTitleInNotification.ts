// 알림 제목 영역 높이에 맞게 과제명만 잘라 표시합니다.
export const ASSIGNMENT_TITLE_MIN_VISIBLE_CHARS = 6;
export const NOTIFICATION_TITLE_MAX_LINES = 3;

export function truncateAssignmentTitleChars(
  title: string,
  visibleCharCount: number,
): string {
  if (visibleCharCount >= title.length) {
    return title;
  }
  const count = Math.max(ASSIGNMENT_TITLE_MIN_VISIBLE_CHARS, visibleCharCount);
  return `${title.slice(0, count)}…`;
}

export function findMaxVisibleAssignmentTitleLength(
  fits: (visibleLength: number) => boolean,
  titleLength: number,
): number {
  if (titleLength <= ASSIGNMENT_TITLE_MIN_VISIBLE_CHARS) {
    return titleLength;
  }
  if (fits(titleLength)) {
    return titleLength;
  }

  let lo = ASSIGNMENT_TITLE_MIN_VISIBLE_CHARS;
  let hi = titleLength - 1;
  let best = lo;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}
