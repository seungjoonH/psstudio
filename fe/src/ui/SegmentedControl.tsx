// 라디오 그룹을 세그먼트 버튼 형태로 표시합니다.
import { buildCls } from "../lib/buildCls";
import styles from "./SegmentedControl.module.css";

export type SegmentOption = { value: string; label: string };

type Props = {
  name: string;
  options: SegmentOption[];
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  wrap?: boolean;
  noWrap?: boolean;
  "aria-label"?: string;
};

export function SegmentedControl({
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  className,
  wrap = false,
  noWrap = false,
  "aria-label": ariaLabel,
}: Props) {
  const controlled = value !== undefined;

  return (
    <div
      className={buildCls(styles.root, wrap && styles.wrap, noWrap && styles.noWrap, className)}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <label key={o.value} className={styles.segment}>
          <input
            type="radio"
            name={name}
            value={o.value}
            className={styles.radio}
            {...(controlled
              ? {checked: o.value === value, onChange: () => onValueChange?.(o.value)}
              : {defaultChecked: o.value === defaultValue})}
          />
          <span className={styles.face}>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
