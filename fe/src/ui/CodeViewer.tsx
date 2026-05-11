"use client";

// shiki 기반 코드 뷰어 컴포넌트입니다.
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import styles from "./CodeViewer.module.css";

const LANG_MAP: Record<string, string> = {
  cpp: "cpp",
  c: "c",
  java: "java",
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  go: "go",
  rs: "javascript",
  rust: "javascript",
  kotlin: "kotlin",
  swift: "swift",
  ruby: "ruby",
  csharp: "csharp",
  other: "txt",
};

type Props = {
  code: string;
  language: string;
};

export function CodeViewer({ code, language }: Props) {
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
    const lang = LANG_MAP[language] ?? "txt";
    codeToHtml(code, { lang, theme })
      .then((out) => {
        if (cancelled) return;
        setHtml(out);
      })
      .catch(() => {
        if (cancelled) return;
        setHtml(`<pre>${escapeHtml(code)}</pre>`);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  if (html.length === 0) {
    return (
      <pre className={styles.fallback}>
        <code>{code}</code>
      </pre>
    );
  }
  return <div className={styles.root} dangerouslySetInnerHTML={{ __html: html }} />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
