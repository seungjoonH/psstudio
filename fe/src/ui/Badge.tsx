// 작은 상태 배지입니다.
import type { HTMLAttributes, ReactNode } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Badge.module.css";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "dangerStrong"
  | "dueIdle"
  | "dueWarm"
  | "dueOrange"
  | "dueHot"
  | "duePast";

type BadgeProps = {
  tone?: BadgeTone;
  /** neutral 톤에서 칩 색상을 레벨 단위로 고정할 때 사용합니다. */
  chipIndex?: number;
} & HTMLAttributes<HTMLSpanElement>;

function flattenText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  return "";
}

function hashToIndex(text: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(h) % modulo;
}

export function Badge({ tone = "neutral", chipIndex, className, ...rest }: BadgeProps) {
  const text = flattenText(rest.children);
  const index = text.length > 0 ? hashToIndex(text, 8) : Math.abs(chipIndex ?? 0) % 8;
  const dynamicClass =
    tone === "neutral" && text.length > 0 ? styles[`chip${index}` as keyof typeof styles] : undefined;

  return <span {...rest} className={buildCls(styles.root, styles[tone], dynamicClass, className)} />;
}
