"use client";

// 과제 생성/수정 폼에서 알고리즘 키워드를 칩 형태로 입력하는 공용 컴포넌트입니다.
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  ASSIGNMENT_ALGORITHM_KEYWORDS,
  formatAssignmentAlgorithmLabel,
} from "./algorithmLabels";
import styles from "./AssignmentAlgorithmTagInput.module.css";

type AlgorithmKeyword = (typeof ASSIGNMENT_ALGORITHM_KEYWORDS)[number];

const ALIAS_TO_KEYWORD: Record<string, AlgorithmKeyword> = {
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
  기타: "기타",
  others: "기타",
  other: "기타",
  etc: "기타",
  misc: "기타",
};

export function normalizeAlgorithmTagToken(raw: string): AlgorithmKeyword | null {
  const compact = raw.trim();
  if (compact.length === 0) return null;
  const normalizedKey = compact.replace(/[\s_-]+/g, "").toLowerCase();
  return ALIAS_TO_KEYWORD[normalizedKey] ?? null;
}

export function normalizeAlgorithmTagList(raw: readonly string[]): AlgorithmKeyword[] {
  const normalized = raw
    .map(normalizeAlgorithmTagToken)
    .filter((token): token is AlgorithmKeyword => token !== null);
  return Array.from(new Set(normalized));
}

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  tone: "private" | "public";
};

export function AssignmentAlgorithmTagInput({ value, onChange, tone }: Props) {
  const { locale } = useI18n();
  const [tagInput, setTagInput] = useState("");
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const addTagsFromInput = (input: string) => {
    const next = input
      .split(",")
      .map(normalizeAlgorithmTagToken)
      .filter((token): token is AlgorithmKeyword => token !== null);
    if (next.length === 0) return;
    onChange(Array.from(new Set([...valueRef.current, ...next])));
  };

  const removeTag = (tag: string) => {
    onChange(valueRef.current.filter((item) => item !== tag));
  };

  const toneClass = tone === "private" ? styles.privateField : styles.publicField;
  const removeAriaLabel = (label: string) =>
    locale === "ko" ? `${label} 제거` : `Remove ${label}`;

  return (
    <>
      <div className={`${styles.tagsWrap} ${toneClass}`}>
        {value.map((tag) => {
          const label = formatAssignmentAlgorithmLabel(locale, tag);
          return (
            <span key={tag} className={styles.tagChip}>
              <span className={styles.tagChipLabel}>{label}</span>
              <button
                type="button"
                className={styles.tagChipRemove}
                onClick={() => removeTag(tag)}
                aria-label={removeAriaLabel(label)}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && tagInput.trim().length === 0) {
              onChange(valueRef.current.slice(0, -1));
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
      <div className={styles.tagPresetRow}>
        {ASSIGNMENT_ALGORITHM_KEYWORDS.map((keyword) => (
          <button
            key={keyword}
            type="button"
            className={styles.presetChip}
            onClick={() => {
              if (value.includes(keyword)) return;
              onChange([...value, keyword]);
            }}
          >
            {formatAssignmentAlgorithmLabel(locale, keyword)}
          </button>
        ))}
      </div>
    </>
  );
}
