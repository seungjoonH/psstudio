"use client";

// 과제 생성 폼을 i18n 적용해 렌더링합니다.
import { useState } from "react";
import { useI18n } from "../../../../../src/i18n/I18nProvider";
import {
  ASSIGNMENT_ALGORITHM_KEYWORDS,
  formatAssignmentAlgorithmLabel,
} from "../../../../../src/assignments/algorithmLabels";
import { Button } from "../../../../../src/ui/Button";
import { SubmitButton } from "../../../../../src/ui/SubmitButton";
import { Icon } from "../../../../../src/ui/Icon";
import { SegmentedControl } from "../../../../../src/ui/SegmentedControl";
import { Switch } from "../../../../../src/ui/Switch";
import styles from "./page.module.css";

type Props = {
  action: (formData: FormData) => Promise<void>;
  autofillAction: (problemUrl: string) => Promise<{ title: string; hint: string; algorithms: string[]; difficulty: string }>;
  defaultDueTime: string;
  initialDueDate?: string;
};

const DAY_OPTIONS = ["1", "3", "7", "14"] as const;
const WEEKDAY_OPTIONS = ["1", "2", "3", "4", "5", "6", "7"] as const;
const ALIAS_TO_KEYWORD: Record<string, (typeof ASSIGNMENT_ALGORITHM_KEYWORDS)[number]> = {
  bfs: "BFS",
  너비우선탐색: "BFS",
  dfs: "DFS",
  깊이우선탐색: "DFS",
  dp: "DP",
  dynamicprogramming: "DP",
  동적계획법: "DP",
  문자열: "문자열",
  string: "문자열",
  parsing: "파싱",
  파싱: "파싱",
  구현: "구현",
  자료구조: "자료구조",
  완전탐색: "완전탐색",
  bruteforce: "브루트포스",
  브루트포스: "브루트포스",
  greedy: "그리디",
  그리디: "그리디",
  binarysearch: "이진탐색",
  이진탐색: "이진탐색",
  shortestpath: "최단경로",
  최단경로: "최단경로",
  floydwarshall: "플로이드워셜",
  플로이드워셜: "플로이드워셜",
  bellmanford: "벨만포드",
  벨만포드: "벨만포드",
  topsort: "위상정렬",
  topologicalsort: "위상정렬",
  위상정렬: "위상정렬",
  scc: "강한연결요소",
  stronglyconnectedcomponents: "강한연결요소",
  강한연결요소: "강한연결요소",
  mst: "최소신장트리",
  최소신장트리: "최소신장트리",
  graph: "그래프",
  그래프: "그래프",
  backtracking: "백트래킹",
  백트래킹: "백트래킹",
  bitmasking: "비트마스킹",
  비트마스킹: "비트마스킹",
  dijkstra: "다익스트라",
  다익스트라: "다익스트라",
  sort: "정렬",
  정렬: "정렬",
  hash: "해시",
  해시: "해시",
  tree: "트리",
  트리: "트리",
  queue: "큐",
  큐: "큐",
  stack: "스택",
  스택: "스택",
  priorityqueue: "우선순위큐",
  우선순위큐: "우선순위큐",
  simulation: "시뮬레이션",
  시뮬레이션: "시뮬레이션",
  math: "수학",
  수학: "수학",
  prefixsum: "누적합",
  누적합: "누적합",
  differencearray: "차분배열",
  차분배열: "차분배열",
  twopointer: "투포인터",
  투포인터: "투포인터",
  slidingwindow: "슬라이딩윈도우",
  슬라이딩윈도우: "슬라이딩윈도우",
  unionfind: "유니온파인드",
  유니온파인드: "유니온파인드",
  recursion: "재귀",
  재귀: "재귀",
  segmenttree: "세그먼트트리",
  세그먼트트리: "세그먼트트리",
  fenwicktree: "펜윅트리",
  펜윅트리: "펜윅트리",
  sparsearray: "희소배열",
  sparsetable: "희소배열",
  희소배열: "희소배열",
  trie: "트라이",
  트라이: "트라이",
  maxflow: "최대유량",
  최대유량: "최대유량",
  bipartitematching: "이분매칭",
  이분매칭: "이분매칭",
  networkflow: "네트워크플로우",
  네트워크플로우: "네트워크플로우",
  divideandconquer: "분할정복",
  분할정복: "분할정복",
};

const toDateTimeLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
};

const parseTime = (time: string): { hour: number; minute: number } => {
  const [h, m] = time.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 23, minute: 59 };
  return { hour, minute };
};

const normalizeDueTime = (value: string): string => {
  const matched = /^(\d{2}):(\d{2})$/.exec(value);
  if (!matched) return "23:59";
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "23:59";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "23:59";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const extractTime = (localDateTime: string): string => {
  const parts = localDateTime.split("T");
  if (parts.length < 2) return "23:59";
  return parts[1].slice(0, 5);
};

const isValidDateOnly = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const computeDueAtByDays = (days: string, dueTime: string): Date => {
  const now = new Date();
  const { hour, minute } = parseTime(dueTime);
  const next = new Date(now);
  next.setDate(next.getDate() + Number(days));
  next.setHours(hour, minute, 0, 0);
  return next;
};

const computeDueAtByWeekday = (weekday: string, dueTime: string): Date => {
  const now = new Date();
  const { hour, minute } = parseTime(dueTime);
  const target = Number(weekday) % 7;
  const next = new Date(now);
  const diff = (target - now.getDay() + 7) % 7;
  next.setDate(now.getDate() + diff);
  next.setHours(hour, minute, 0, 0);
  if (diff === 0 && next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
  return next;
};

export function NewAssignmentForm({ action, autofillAction, defaultDueTime, initialDueDate }: Props) {
  const { t, locale } = useI18n();
  const [title, setTitle] = useState("");
  const [problemUrl, setProblemUrl] = useState("");
  const [hint, setHint] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [algorithms, setAlgorithms] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [autoFillError, setAutoFillError] = useState<string | null>(null);
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [hintHiddenUntilSubmit, setHintHiddenUntilSubmit] = useState(true);
  const [algorithmsHiddenUntilSubmit, setAlgorithmsHiddenUntilSubmit] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<"days" | "weekday">("days");
  const [periodDays, setPeriodDays] = useState<(typeof DAY_OPTIONS)[number] | null>("7");
  const [weekday, setWeekday] = useState<(typeof WEEKDAY_OPTIONS)[number] | null>("2");
  const [dueAtLocal, setDueAtLocal] = useState(() => {
    const time = normalizeDueTime(defaultDueTime);
    if (initialDueDate !== undefined && isValidDateOnly(initialDueDate)) {
      return `${initialDueDate}T${time}`;
    }
    return toDateTimeLocal(computeDueAtByDays("7", time));
  });

  const normalizeTagToken = (raw: string): string | null => {
    const compact = raw.trim();
    if (compact.length === 0) return null;
    const normalizedKey = compact.replace(/[\s_-]+/g, "").toLowerCase();
    return ALIAS_TO_KEYWORD[normalizedKey] ?? null;
  };

  const addTagsFromInput = (input: string) => {
    const next = input
      .split(",")
      .map((token) => normalizeTagToken(token))
      .filter((token): token is string => token !== null);
    if (next.length === 0) return;
    setAlgorithms((prev) => Array.from(new Set([...prev, ...next])));
  };

  const inferAutofill = async () => {
    try {
      setAutofillLoading(true);
      setAutoFillError(null);
      const result = await autofillAction(problemUrl);
      if (result.title.trim().length > 0) setTitle(result.title);
      if (result.hint.trim().length > 0) setHint(result.hint);
      if (result.difficulty.trim().length > 0) setDifficulty(result.difficulty);
      const normalized = result.algorithms
        .map((token) => normalizeTagToken(token))
        .filter((token): token is string => token !== null);
      // AI 자동 채우기에서는 기존 알고리즘을 유지하지 않고 새 결과로 덮어쓴다.
      setAlgorithms(Array.from(new Set(normalized)));
    } catch (error) {
      setAutoFillError((error as Error).message);
      window.setTimeout(() => setAutoFillError(null), 2600);
    } finally {
      setAutofillLoading(false);
    }
  };

  const periodOptions = DAY_OPTIONS.map((value) => ({
    value,
    label: t("assignment.new.periodDaysOption", { days: value }),
  }));

  const weekdayOptions = WEEKDAY_OPTIONS.map((value) => ({
    value,
    label: t(`assignment.new.weekdayOption.${value}`),
  }));

  return (
    <form action={action} className={styles.form}>
      <div className={styles.contentSplit}>
        <div className={styles.leftCol}>
          <label className={styles.label}>
            {t("assignment.new.fieldTitle")}
            <input
              name="title"
              required
              maxLength={200}
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={styles.label}>
            {t("assignment.new.fieldUrl")}
            <div className={styles.urlRow}>
              <input
                name="problemUrl"
                required
                type="url"
                placeholder="https://www.acmicpc.net/problem/1000"
                className={styles.input}
                value={problemUrl}
                onChange={(e) => setProblemUrl(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={inferAutofill}
                loading={autofillLoading}
                leftIcon={<Icon name="sparkles" size={16} />}
              >
                {t("assignment.new.autoFill")}
              </Button>
            </div>
            {autoFillError !== null ? <span className={styles.toastError}>{autoFillError}</span> : null}
          </label>
          <label className={styles.label}>
            {t("assignment.new.fieldDifficulty")}
            <input
              name="difficulty"
              maxLength={50}
              className={styles.input}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder={t("assignment.new.fieldDifficultyPlaceholder")}
            />
          </label>
          <label className={styles.label}>
            {t("assignment.new.fieldAlgorithms")}
            <span className={styles.visibilityHint}>
              {algorithmsHiddenUntilSubmit
                ? t("assignment.new.visibilityPrivateStatus")
                : t("assignment.new.visibilityPublicStatus")}
            </span>
            <div className={`${styles.tagsWrap} ${algorithmsHiddenUntilSubmit ? styles.privateField : styles.publicField}`}>
              {algorithms.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={styles.tagChip}
                  onClick={() => setAlgorithms((prev) => prev.filter((item) => item !== tag))}
                >
                  {formatAssignmentAlgorithmLabel(locale, tag)} ×
                </button>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && tagInput.trim().length === 0) {
                    setAlgorithms((prev) => prev.slice(0, -1));
                    return;
                  }
                  if (e.key !== "," && e.key !== "Enter") return;
                  e.preventDefault();
                  addTagsFromInput(tagInput);
                  setTagInput("");
                }}
                onBlur={() => {
                  addTagsFromInput(tagInput);
                  setTagInput("");
                }}
                className={styles.tagInput}
              />
            </div>
            <input type="hidden" name="algorithms" value={algorithms.join(",")} />
            <div className={styles.tagPresetRow}>
              {ASSIGNMENT_ALGORITHM_KEYWORDS.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  className={styles.presetChip}
                  onClick={() => setAlgorithms((prev) => (prev.includes(keyword) ? prev : [...prev, keyword]))}
                >
                  {formatAssignmentAlgorithmLabel(locale, keyword)}
                </button>
              ))}
            </div>
          </label>
          <label className={`${styles.label} ${styles.descLabel}`}>
            {t("assignment.new.fieldHint")}
            <span className={styles.visibilityHint}>
              {hintHiddenUntilSubmit
                ? t("assignment.new.visibilityPrivateStatus")
                : t("assignment.new.visibilityPublicStatus")}
            </span>
            <textarea
              name="hint"
              rows={4}
              maxLength={2000}
              className={`${styles.textarea} ${hintHiddenUntilSubmit ? styles.privateField : styles.publicField}`}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
            />
          </label>
        </div>

        <div className={styles.rightCol}>
          <section className={styles.scheduleSection}>
            <h3 className={styles.sectionTitle}>{t("assignment.new.scheduleTitle")}</h3>
            <div
              className={styles.modeWrap}
              onChange={(e) => {
                const target = e.target as HTMLInputElement;
                if (target.name === "scheduleMode" && target.checked) {
                  setScheduleMode(target.value as "days" | "weekday");
                  const nextMode = target.value as "days" | "weekday";
                  const currentTime = normalizeDueTime(extractTime(dueAtLocal));
                  if (nextMode === "days" && periodDays !== null) {
                    setDueAtLocal(toDateTimeLocal(computeDueAtByDays(periodDays, currentTime)));
                  }
                  if (nextMode === "weekday" && weekday !== null) {
                    setDueAtLocal(toDateTimeLocal(computeDueAtByWeekday(weekday, currentTime)));
                  }
                }
              }}
            >
              <SegmentedControl
                name="scheduleMode"
                defaultValue="days"
                aria-label={t("assignment.new.scheduleModeLabel")}
                options={[
                  { value: "days", label: t("assignment.new.scheduleMode.days") },
                  { value: "weekday", label: t("assignment.new.scheduleMode.weekday") },
                ]}
              />
            </div>

            {scheduleMode === "days" ? (
              <div
                className={styles.modeWrap}
                onChange={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.name === "periodDays" && target.checked) {
                    const currentTime = normalizeDueTime(extractTime(dueAtLocal));
                    setPeriodDays(target.value as (typeof DAY_OPTIONS)[number]);
                    setDueAtLocal(toDateTimeLocal(computeDueAtByDays(target.value, currentTime)));
                  }
                }}
              >
                <label className={styles.modeLabel}>{t("assignment.new.periodDaysLabel")}</label>
                <SegmentedControl
                  name="periodDays"
                  defaultValue="7"
                  value={periodDays ?? ""}
                  aria-label={t("assignment.new.periodDaysLabel")}
                  options={periodOptions}
                />
              </div>
            ) : (
              <div
                className={styles.modeWrap}
                onChange={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.name === "weekday" && target.checked) {
                    const currentTime = normalizeDueTime(extractTime(dueAtLocal));
                    setWeekday(target.value as (typeof WEEKDAY_OPTIONS)[number]);
                    setDueAtLocal(toDateTimeLocal(computeDueAtByWeekday(target.value, currentTime)));
                  }
                }}
              >
                <label className={styles.modeLabel}>{t("assignment.new.weekdayLabel")}</label>
                <SegmentedControl
                  name="weekday"
                  defaultValue="2"
                  value={weekday ?? ""}
                  aria-label={t("assignment.new.weekdayLabel")}
                  options={weekdayOptions}
                  className={styles.weekdaySegment}
                />
              </div>
            )}

            <label className={styles.label}>
              {t("assignment.new.fieldDueAt")}
              <input
                name="dueAt"
                type="datetime-local"
                value={dueAtLocal}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setDueAtLocal(nextValue);

                  const now = new Date();
                  const due = new Date(nextValue);
                  if (Number.isNaN(due.getTime())) {
                    if (scheduleMode === "days") setPeriodDays(null);
                    else setWeekday(null);
                    return;
                  }
                  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

                  if (scheduleMode === "days") {
                    if (diffDays < 0 || diffDays > 14) {
                      setPeriodDays(null);
                      return;
                    }
                    const matched = DAY_OPTIONS.find((v) => Number(v) === diffDays) ?? null;
                    setPeriodDays(matched);
                    return;
                  }

                  if (diffDays < 0 || diffDays >= 8) {
                    setWeekday(null);
                    return;
                  }
                  const nextWeekday = due.getDay() === 0 ? "7" : String(due.getDay());
                  setWeekday(nextWeekday as (typeof WEEKDAY_OPTIONS)[number]);
                }}
                required
                className={styles.input}
              />
            </label>
          </section>

          <Switch name="allowLateSubmission" defaultChecked>
            {t("assignment.new.fieldLate")}
          </Switch>
          <div
            className={styles.visibilitySwitches}
            onChange={(event) => {
              const target = event.target as HTMLInputElement;
              if (target.name === "algorithmsHiddenUntilSubmit") setAlgorithmsHiddenUntilSubmit(target.checked);
              if (target.name === "hintHiddenUntilSubmit") setHintHiddenUntilSubmit(target.checked);
            }}
          >
            <Switch name="algorithmsHiddenUntilSubmit" defaultChecked>
              {t("assignment.new.algorithmsVisibilityPrivate")}
            </Switch>
            <Switch name="hintHiddenUntilSubmit" defaultChecked>
              {t("assignment.new.hintVisibilityPrivate")}
            </Switch>
          </div>
        </div>
      </div>
      <div className={styles.submitRow}>
        <SubmitButton variant="primary">
          {t("assignment.new.submit")}
        </SubmitButton>
      </div>
    </form>
  );
}
