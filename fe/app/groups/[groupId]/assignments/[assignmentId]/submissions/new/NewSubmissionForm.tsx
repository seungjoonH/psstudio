"use client";

// 새 제출 폼입니다. 코드 입력은 CodeMirror 기반 편집기를 쓰며 언어를 키워드 기반으로 추정합니다.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MAX_SUBMISSION_CODE_BYTES } from "@psstudio/shared";
import {
  GROUP_TRANSLATION_LANGUAGE_VALUES,
  type GroupTranslationLanguage,
} from "../../../../../../../src/groups/groupTranslationLanguage";
import { useI18n } from "../../../../../../../src/i18n/I18nProvider";
import { SegmentedControl } from "../../../../../../../src/ui/SegmentedControl";
import { MarkdownPreview } from "../../../../../../../src/ui/MarkdownPreview";
import { SubmitButton } from "../../../../../../../src/ui/SubmitButton";
import { SubmissionCodeEditor } from "../../../../../../../src/ui/SubmissionCodeEditor";
import { detectLanguageInBrowser } from "../../../../../../../src/submissions/detect";
import styles from "./NewSubmissionForm.module.css";

type Props = {
  action: (formData: FormData) => Promise<void>;
  authorNickname: string;
  submissionSequenceNo: number;
};

function submissionSegmentLabel(lang: GroupTranslationLanguage): string {
  switch (lang) {
    case "cpp":
      return "C++";
    case "c":
      return "C";
    case "java":
      return "Java";
    case "python":
      return "Python";
    case "javascript":
      return "JavaScript";
    case "typescript":
      return "TypeScript";
    default:
      return lang;
  }
}

export function NewSubmissionForm({ action, authorNickname, submissionSequenceNo }: Props) {
  const { t, locale } = useI18n();
  const titleEditedRef = useRef(false);
  const [code, setCode] = useState("");
  const [noteMarkdown, setNoteMarkdown] = useState("");
  const [noteTab, setNoteTab] = useState<"write" | "preview">("write");
  const [language, setLanguage] = useState<GroupTranslationLanguage>("python");
  const [title, setTitle] = useState(() =>
    t("submission.new.defaultTitle", { nickname: authorNickname, n: submissionSequenceNo }),
  );

  useLayoutEffect(() => {
    if (!titleEditedRef.current) {
      setTitle(t("submission.new.defaultTitle", { nickname: authorNickname, n: submissionSequenceNo }));
    }
  }, [t, locale, authorNickname, submissionSequenceNo]);

  const byteLength = useMemo(() => new Blob([code]).size, [code]);
  const overLimit = byteLength > MAX_SUBMISSION_CODE_BYTES;

  const submissionLangSegments = useMemo(
    () =>
      GROUP_TRANSLATION_LANGUAGE_VALUES.map((l) => ({
        value: l,
        label: submissionSegmentLabel(l),
      })),
    [],
  );

  function onCodeChange(value: string) {
    setCode(value);
    if (value.length > 20) {
      const guess = detectLanguageInBrowser(value);
      const allowed = GROUP_TRANSLATION_LANGUAGE_VALUES as readonly string[];
      if (guess !== "other" && allowed.includes(guess)) {
        setLanguage(guess as GroupTranslationLanguage);
      }
    }
  }

  return (
    <form action={action} className={styles.form}>
      <div className={styles.topRow}>
        <label className={`${styles.label} ${styles.titleField}`}>
          {t("submission.new.fieldTitle")}
          <input
            name="title"
            value={title}
            onChange={(e) => {
              titleEditedRef.current = true;
              setTitle(e.target.value);
            }}
            placeholder={t("submission.new.fieldTitlePlaceholder")}
            maxLength={100}
            className={styles.input}
          />
        </label>
        <div className={`${styles.label} ${styles.langField}`}>
          <span>{t("submission.new.fieldLang")}</span>
          <SegmentedControl
            name="language"
            defaultValue="python"
            value={language}
            onValueChange={(v) => setLanguage(v as GroupTranslationLanguage)}
            noWrap
            aria-label={t("submission.new.fieldLang")}
            options={submissionLangSegments}
            className={styles.langSegments}
          />
        </div>
      </div>
      <div className={styles.codeSection}>
        <input type="hidden" name="code" value={code} />
        <div className={styles.codeAndNote}>
          <div className={styles.codePane}>
            <span className={styles.paneLabel}>
              {t("submission.new.fieldCode", {
                cur: byteLength.toLocaleString(),
                max: MAX_SUBMISSION_CODE_BYTES.toLocaleString(),
              })}
            </span>
            <SubmissionCodeEditor value={code} onChange={onCodeChange} language={language} />
          </div>
          <label className={styles.notePane} htmlFor="submission-note-markdown">
            <span className={styles.paneLabel}>{t("submission.new.fieldNote")}</span>
            <div className={styles.noteBox}>
              <div className={styles.noteTabs}>
                <button
                  type="button"
                  className={noteTab === "write" ? styles.noteTabActive : styles.noteTab}
                  onClick={() => setNoteTab("write")}
                >
                  {t("submission.new.noteWrite")}
                </button>
                <button
                  type="button"
                  className={noteTab === "preview" ? styles.noteTabActive : styles.noteTab}
                  onClick={() => setNoteTab("preview")}
                >
                  {t("submission.new.notePreview")}
                </button>
              </div>
              {noteTab === "write" ? (
                <textarea
                  id="submission-note-markdown"
                  name="noteMarkdown"
                  value={noteMarkdown}
                  onChange={(event) => setNoteMarkdown(event.target.value)}
                  placeholder={t("submission.new.fieldNotePlaceholder")}
                  className={styles.noteTextarea}
                />
              ) : (
                <div className={styles.notePreviewBox}>
                  {noteMarkdown.trim().length > 0 ? (
                    <MarkdownPreview content={noteMarkdown} />
                  ) : (
                    <p className={styles.notePreviewEmpty}>{t("submission.new.notePreviewEmpty")}</p>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>
      </div>
      {overLimit ? <p className={styles.error}>{t("submission.new.overLimit")}</p> : null}
      <div>
        <SubmitButton variant="primary" disabled={overLimit || code.length === 0}>
          {t("submission.new.submit")}
        </SubmitButton>
      </div>
    </form>
  );
}
