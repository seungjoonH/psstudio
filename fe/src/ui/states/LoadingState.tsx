// 로딩 상태 UI 블록입니다.
import styles from "./States.module.css";

export function LoadingState({ label }: { label: string }) {
  return (
    <section className={styles.box} aria-busy="true" aria-live="polite">
      <div className={styles.spinner} />
      <p className={styles.desc}>{label}</p>
    </section>
  );
}
