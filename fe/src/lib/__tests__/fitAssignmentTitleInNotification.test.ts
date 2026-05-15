import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_TITLE_MIN_VISIBLE_CHARS,
  findMaxVisibleAssignmentTitleLength,
  truncateAssignmentTitleChars,
} from "../../notifications/fitAssignmentTitleInNotification";

describe("truncateAssignmentTitleChars", () => {
  it("keeps short titles unchanged", () => {
    expect(truncateAssignmentTitleChars("짧은제목", 10)).toBe("짧은제목");
  });

  it("truncates with ellipsis and enforces minimum visible chars", () => {
    expect(truncateAssignmentTitleChars("문자열과 알파벳과 쿼리", 4)).toBe(
      `${"문자열과 알파벳과 쿼리".slice(0, ASSIGNMENT_TITLE_MIN_VISIBLE_CHARS)}…`,
    );
  });
});

describe("findMaxVisibleAssignmentTitleLength", () => {
  it("returns full length when everything fits", () => {
    const length = findMaxVisibleAssignmentTitleLength(() => true, 12);
    expect(length).toBe(12);
  });

  it("returns the largest length that still fits", () => {
    const fits = (len: number) => len <= 8;
    const length = findMaxVisibleAssignmentTitleLength(fits, 20);
    expect(length).toBe(8);
  });
});
