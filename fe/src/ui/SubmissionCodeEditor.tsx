"use client";

// 제출 코드 입력용 CodeMirror 편집기(라인 번호·현재 줄·문법 강조)입니다.
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { javascript as legacyJavascript } from "@codemirror/legacy-modes/mode/javascript";
import { python } from "@codemirror/lang-python";
import { StreamLanguage, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { c, csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";
import type { SupportedLanguage } from "@psstudio/shared";
import { SUPPORTED_LANGUAGES } from "@psstudio/shared";
import styles from "./SubmissionCodeEditor.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  language: SupportedLanguage | string;
};

function normalizeLanguage(lang: string): SupportedLanguage {
  const raw = lang.trim().toLowerCase();
  if (raw === "rust" || raw === "rs") return "javascript";
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage) ? (lang as SupportedLanguage) : "other";
}

function languageExtensions(lang: SupportedLanguage): Extension {
  switch (lang) {
    case "cpp":
      return cpp();
    case "c":
      return StreamLanguage.define(c);
    case "java":
      return java();
    case "python":
      return python();
    case "javascript":
      return StreamLanguage.define(legacyJavascript);
    case "typescript":
      return javascript({ jsx: false, typescript: true });
    case "go":
      return go();
    case "ruby":
      return StreamLanguage.define(ruby);
    case "swift":
      return StreamLanguage.define(swift);
    case "kotlin":
      return StreamLanguage.define(kotlin);
    case "csharp":
      return StreamLanguage.define(csharp);
    case "other":
    default:
      return [];
  }
}

const editorTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
  },
  "&.cm-editor": {
    height: "100%",
  },
  ".cm-scroller": {
    overflowY: "auto",
    overflowX: "hidden",
    height: "100%",
    minHeight: "360px",
    maxHeight: "none",
    alignItems: "stretch",
    paddingRight: "0",
  },
  ".cm-sizer": {
    minWidth: "100%",
  },
  ".cm-content": {
    caretColor: "var(--color-primary)",
    paddingTop: "10px",
    paddingBottom: "14px",
    minWidth: "100%",
    minHeight: "100%",
  },
  ".cm-gutters": {
    backgroundColor: "color-mix(in oklab, var(--color-surface-muted) 88%, var(--color-surface))",
    color: "var(--color-muted)",
    border: "none",
    borderRight: "1px solid var(--color-border)",
    paddingRight: "0",
    alignSelf: "stretch",
    minHeight: "100%",
    height: "100%",
  },
  ".cm-gutter": {
    minHeight: "100%",
    height: "100%",
  },
  ".cm-gutterElement": {
    display: "flex",
    alignItems: "center",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.25rem",
    padding: "0 6px 0 8px",
    textAlign: "right",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--color-primary) 14%, transparent)",
    color: "var(--color-text)",
    fontWeight: "700",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--color-primary) 9%, transparent)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-editor.cm-focused": {
    boxShadow: "none",
  },
  ".cm-cursor": {
    borderLeftWidth: "2px",
  },
  ".cm-focused .cm-cursor": {
    borderLeftColor: "var(--color-primary)",
  },
});

export function SubmissionCodeEditor({ value, onChange, language }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const normalized = normalizeLanguage(language);

  useEffect(() => {
    const root = parentRef.current;
    if (root === null) return;

    const view = new EditorView({
      parent: root,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ spellcheck: "false" }),
          langCompartment.current.of(languageExtensions(normalized)),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 초기 마운트 시 한 번만 에디터 생성
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(languageExtensions(normalized)),
    });
  }, [normalized]);

  return <div ref={parentRef} className={styles.wrap} />;
}
