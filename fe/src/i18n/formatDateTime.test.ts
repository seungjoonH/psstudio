// KST 날짜 유틸의 변환과 포맷 규칙을 검증합니다.
import { describe, expect, it } from "vitest";
import {
  formatKstDate,
  formatKstDateTime,
  formatKstDateWithWeekday,
  formatKstMonthLabel,
  formatKstWeekRangeLabel,
  getKstDateKey,
  isSameKstDay,
  kstDateTimeLocalInputToUtcIso,
  toKstDateTimeLocalInput,
} from "./formatDateTime";

describe("formatDateTime", () => {
  it("KST datetime-local 입력을 UTC ISO로 변환한다", () => {
    expect(kstDateTimeLocalInputToUtcIso("2026-05-13T23:59")).toBe("2026-05-13T14:59:00.000Z");
    expect(kstDateTimeLocalInputToUtcIso("2026-05-13T00:00")).toBe("2026-05-12T15:00:00.000Z");
  });

  it("UTC ISO를 KST datetime-local 값으로 역변환한다", () => {
    expect(toKstDateTimeLocalInput("2026-05-13T14:59:00.000Z")).toBe("2026-05-13T23:59");
    expect(toKstDateTimeLocalInput("2026-05-12T15:00:00.000Z")).toBe("2026-05-13T00:00");
  });

  it("한국어 날짜/시간 포맷을 고정 숫자 형식으로 만든다", () => {
    expect(formatKstDateTime("2026-05-13T14:59:00.000Z", "ko")).toBe("2026. 05. 13. 23:59:00");
    expect(formatKstDate("2026-05-13T14:59:00.000Z", "ko")).toBe("2026. 05. 13.");
    expect(formatKstDateWithWeekday("2026-05-13T14:59:00.000Z", "ko")).toBe("2026. 05. 13. 수요일");
  });

  it("영어 날짜/시간 포맷을 서수와 24시간제로 만든다", () => {
    expect(formatKstDateTime("2026-03-30T14:59:00.000Z", "en")).toBe("30th March 2026, 23:59:00");
    expect(formatKstDate("2026-03-01T00:00:00.000Z", "en")).toBe("1st March 2026");
    expect(formatKstDateWithWeekday("2026-03-02T00:00:00.000Z", "en")).toBe("Monday, 2nd March 2026");
    expect(formatKstMonthLabel("2026-03-30T14:59:00.000Z", "en")).toBe("March 2026");
  });

  it("KST 날짜 키와 주간 범위를 계산한다", () => {
    expect(getKstDateKey("2026-05-12T15:00:00.000Z")).toBe("2026-05-13");
    expect(isSameKstDay("2026-05-12T15:00:00.000Z", "2026-05-13T14:59:00.000Z")).toBe(true);
    expect(formatKstWeekRangeLabel("2026-05-10T00:00:00.000Z", "2026-05-16T00:00:00.000Z", "ko")).toBe(
      "2026. 05. 10. - 2026. 05. 16.",
    );
  });
});
