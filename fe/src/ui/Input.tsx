// 공용 텍스트 입력 컴포넌트입니다.
import type { InputHTMLAttributes } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Input.module.css";

type InputProps = {
  label?: string;
  hint?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <div className={styles.root}>
      {label !== undefined ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input {...rest} id={inputId} className={buildCls(styles.input, error !== undefined ? styles.invalid : "", className)} />
      {hint !== undefined && error === undefined ? <p className={styles.hint}>{hint}</p> : null}
      {error !== undefined ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
