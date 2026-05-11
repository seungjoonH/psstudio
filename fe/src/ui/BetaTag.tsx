// 베타·프리뷰 기능을 나타내는 직사각형 라벨을 렌더링합니다.
import { buildCls } from "../lib/buildCls";
import styles from "./BetaTag.module.css";

type Props = {
  label: string;
  className?: string;
};

export function BetaTag({ label, className }: Props) {
  return <span className={buildCls(styles.root, className)}>{label}</span>;
}
