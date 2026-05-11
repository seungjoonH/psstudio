// 내부 라우트 이동 클릭 직후 즉시 로딩 인디케이터를 보여주는 오버레이입니다.
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./NavigationPendingOverlay.module.css";

export function NavigationPendingOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const current = useMemo(() => {
    const query = searchParams.toString();
    return `${pathname}${query.length > 0 ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    setPending(false);
  }, [current]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (href === null || href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let nextUrl: URL;
      try {
        nextUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (nextUrl.origin !== window.location.origin) return;

      const nextPath = `${nextUrl.pathname}${nextUrl.search}`;
      const nowPath = `${window.location.pathname}${window.location.search}`;
      if (nextPath === nowPath) return;

      setPending(true);
    };

    window.addEventListener("click", onClick, { capture: true });
    return () => window.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
  }, []);

  if (!pending) return null;

  return (
    <div className={styles.overlay} aria-live="polite" aria-busy="true">
      <div className={styles.spinner} />
      <span className={styles.srOnly}>Loading</span>
    </div>
  );
}
