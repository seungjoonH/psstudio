// KST 기준 입력 변환과 날짜/시간 포맷을 공통 처리합니다.
import type { Locale } from "./messages";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const ENGLISH_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const KOREAN_WEEKDAYS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

type DateLike = Date | string | number;

type KstDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateOrNull(value: DateLike): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function kstPartsFromPseudoDate(date: Date): KstDateParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    weekday: date.getUTCDay(),
  };
}

export function toKstPseudoDate(value: DateLike): Date | null {
  const date = toDateOrNull(value);
  return date === null ? null : new Date(date.getTime() + KST_OFFSET_MS);
}

export function fromKstPseudoDateToUtcIso(value: Date): string {
  return new Date(value.getTime() - KST_OFFSET_MS).toISOString();
}

export function createKstPseudoDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
}

export function parseKstDateTimeLocalInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    [year, month, day, hour, minute].some((part) => Number.isNaN(part)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const pseudo = createKstPseudoDate(year, month, day, hour, minute, 0);
  const parts = kstPartsFromPseudoDate(pseudo);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute
  ) {
    return null;
  }
  return pseudo;
}

export function formatKstPseudoDateTimeLocalInput(value: Date): string {
  return [
    String(value.getUTCFullYear()),
    "-",
    pad2(value.getUTCMonth() + 1),
    "-",
    pad2(value.getUTCDate()),
    "T",
    pad2(value.getUTCHours()),
    ":",
    pad2(value.getUTCMinutes()),
  ].join("");
}

export function formatKstPseudoDateKey(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

export function kstDateTimeLocalInputToUtcIso(value: string): string | null {
  const pseudo = parseKstDateTimeLocalInput(value);
  return pseudo === null ? null : fromKstPseudoDateToUtcIso(pseudo);
}

export function toKstDateTimeLocalInput(value: DateLike): string {
  const pseudo = toKstPseudoDate(value);
  return pseudo === null ? "" : formatKstPseudoDateTimeLocalInput(pseudo);
}

export function getKstDateParts(value: DateLike): KstDateParts | null {
  const pseudo = toKstPseudoDate(value);
  return pseudo === null ? null : kstPartsFromPseudoDate(pseudo);
}

export function getKstDateKey(value: DateLike): string {
  const parts = getKstDateParts(value);
  if (parts === null) return "";
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function toKstDateOnly(value: DateLike): string {
  return getKstDateKey(value);
}

export function isSameKstDay(a: DateLike, b: DateLike): boolean {
  const aKey = getKstDateKey(a);
  const bKey = getKstDateKey(b);
  return aKey.length > 0 && aKey === bKey;
}

export function formatKstDate(value: DateLike, locale: Locale): string {
  const parts = getKstDateParts(value);
  if (parts === null) return typeof value === "string" ? value : "";
  if (locale === "ko") {
    return `${parts.year}. ${pad2(parts.month)}. ${pad2(parts.day)}.`;
  }
  return `${toOrdinal(parts.day)} ${ENGLISH_MONTHS[parts.month - 1]} ${parts.year}`;
}

export function formatKstDateWithWeekday(value: DateLike, locale: Locale): string {
  const parts = getKstDateParts(value);
  if (parts === null) return typeof value === "string" ? value : "";
  if (locale === "ko") {
    return `${parts.year}. ${pad2(parts.month)}. ${pad2(parts.day)}. ${KOREAN_WEEKDAYS[parts.weekday]}`;
  }
  return `${ENGLISH_WEEKDAYS[parts.weekday]}, ${toOrdinal(parts.day)} ${ENGLISH_MONTHS[parts.month - 1]} ${parts.year}`;
}

export function formatKstDateTime(value: DateLike, locale: Locale): string {
  const parts = getKstDateParts(value);
  if (parts === null) return typeof value === "string" ? value : "";
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  if (locale === "ko") {
    return `${parts.year}. ${pad2(parts.month)}. ${pad2(parts.day)}. ${time}`;
  }
  return `${toOrdinal(parts.day)} ${ENGLISH_MONTHS[parts.month - 1]} ${parts.year}, ${time}`;
}

export function formatKstMonthLabel(value: DateLike, locale: Locale): string {
  const parts = getKstDateParts(value);
  if (parts === null) return typeof value === "string" ? value : "";
  if (locale === "ko") {
    return `${parts.year}. ${pad2(parts.month)}.`;
  }
  return `${ENGLISH_MONTHS[parts.month - 1]} ${parts.year}`;
}

export function formatKstWeekRangeLabel(weekStart: DateLike, weekEnd: DateLike, locale: Locale): string {
  return `${formatKstDate(weekStart, locale)} - ${formatKstDate(weekEnd, locale)}`;
}
