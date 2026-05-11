"use client";

// 뷰포트 진입 시 한 번만 페이드인합니다(이탈 시 되감지 않아 경계 토글 깜빡임을 막습니다).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildCls } from "../../src/lib/buildCls";
import styles from "./ScrollReveal.module.css";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /** 교차 관측 후 추가 지연(ms). 형제 블록 순차 등장에 사용합니다. */
  delayMs?: number;
};

export function ScrollReveal({ children, className, delayMs = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    let timeoutId: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined) return;
        if (!entry.isIntersecting) return;

        const reveal = () => {
          setVisible(true);
          observer.disconnect();
        };
        if (delayMs > 0) {
          timeoutId = window.setTimeout(reveal, delayMs);
        } else {
          reveal();
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [delayMs]);

  return (
    <div ref={ref} className={buildCls(styles.reveal, visible ? styles.revealVisible : "", className)}>
      {children}
    </div>
  );
}
