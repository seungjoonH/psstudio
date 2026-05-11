// 마크다운 코드블럭을 shiki로 syntax highlight 하는 컴포넌트입니다.
"use client";

import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { resolveShikiLanguage } from "../lib/shikiLanguage";
import styles from "./MarkdownCodeBlock.module.css";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type Props = {
  code: string;
  language: string | null;
};

export function MarkdownCodeBlock({ code, language }: Props) {
  const [html, setHtml] = useState<string>("");
  const [theme, setTheme] = useState<"github-light" | "github-dark">("github-light");

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setTheme(root.dataset.theme === "dark" ? "github-dark" : "github-light");
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const lang = resolveShikiLanguage(language);
    codeToHtml(code, { lang, theme })
      .then((out) => {
        if (cancelled) return;
        setHtml(out);
      })
      .catch(() => {
        if (cancelled) return;
        setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  const wrapClassName = `${styles.root} markdown-code-block`;

  if (html.length === 0) {
    return (
      <div className={wrapClassName}>
        <pre className={styles.fallbackPre}>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  return <div className={wrapClassName} dangerouslySetInnerHTML={{ __html: html }} />;
}
