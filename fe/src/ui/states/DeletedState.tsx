// 삭제/비공개 상태 UI 블록입니다.
import styles from "./States.module.css";

export function DeletedState({ label }: { label: string }) {
  return (
    <section className={styles.boxMuted} aria-label={label}>
      <p className={styles.desc}>{label}</p>
    </section>
  );
}
