// 플랫폼별 난이도 문자열과 색상을 표시하는 배지 컴포넌트입니다.
import { buildCls } from "../lib/buildCls";
import styles from "./DifficultyBadge.module.css";

type Props = {
  platform: string;
  difficulty: string | null | undefined;
};

type DifficultyView = {
  label: string;
  toneClass: string;
};

function normalizeBojDifficulty(raw: string): DifficultyView | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const m = compact.match(/^([BSGPDR])([1-5])$/);
  if (m === null) return null;
  const tier = m[1];
  const level = m[2];
  const toneMap: Record<string, string> = {
    B: styles.bojBronze,
    S: styles.bojSilver,
    G: styles.bojGold,
    P: styles.bojPlatinum,
    D: styles.bojDiamond,
    R: styles.bojRuby,
  };
  return { label: `${tier}${level}`, toneClass: toneMap[tier] };
}

function normalizeProgrammersDifficulty(raw: string): DifficultyView | null {
  const m = raw.match(/(?:^|\b)(?:lv\.?|level)\s*([0-5])(?:\b|$)/i);
  if (m === null) return null;
  const level = Number(m[1]);
  const toneMap: Record<number, string> = {
    0: styles.pgLv0,
    1: styles.pgLv1,
    2: styles.pgLv2,
    3: styles.pgLv3,
    4: styles.pgLv4,
    5: styles.pgLv5,
  };
  return { label: `Lv. ${level}`, toneClass: toneMap[level] };
}

function normalizeLeetCodeDifficulty(raw: string): DifficultyView | null {
  const lower = raw.toLowerCase();
  if (lower.includes("easy")) return { label: "Easy", toneClass: styles.lcEasy };
  if (lower.includes("medium")) return { label: "Medium", toneClass: styles.lcMedium };
  if (lower.includes("hard")) return { label: "Hard", toneClass: styles.lcHard };
  return null;
}

function toDifficultyView(platform: string, difficulty: string): DifficultyView {
  if (platform === "BOJ") {
    return normalizeBojDifficulty(difficulty) ?? { label: difficulty, toneClass: styles.generic };
  }
  if (platform === "Programmers") {
    return normalizeProgrammersDifficulty(difficulty) ?? { label: difficulty, toneClass: styles.generic };
  }
  if (platform === "LeetCode") {
    return normalizeLeetCodeDifficulty(difficulty) ?? { label: difficulty, toneClass: styles.generic };
  }
  return { label: difficulty, toneClass: styles.generic };
}

export function DifficultyBadge({ platform, difficulty }: Props) {
  if (difficulty === null || difficulty === undefined || difficulty.trim().length === 0) return null;
  const view = toDifficultyView(platform, difficulty.trim());
  return <span className={buildCls(styles.root, view.toneClass)}>{view.label}</span>;
}
