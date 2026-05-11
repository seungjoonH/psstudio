// Markdown 본문을 공통 스타일로 렌더링하는 프리뷰 컴포넌트입니다.
"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Children, isValidElement } from "react";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as RehypeSanitizeSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { buildCls } from "../lib/buildCls";
import { normalizeLlmMarkdown } from "../lib/normalizeLlmMarkdown";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import styles from "./MarkdownPreview.module.css";

type Props = {
  content: string;
  className?: string;
  /** true면 문단·칩과 같은 줄에 끼워 넣을 때 쓴다(<p>를 인라인 처리). */
  inline?: boolean;
  /** 댓글 본문 등 좁은 영역 — 기본 본문보다 한 단계 작은 타이포 */
  variant?: "default" | "compact";
};

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

/** rehype → React 과정에서 `<pre>` 자식이 단일 `<code>`가 아니라 공백 텍스트+`<code>` 배열일 수 있다(특히 HTML 표 안). */
function findFirstCodeElement(nodes: ReactNode): React.ReactElement<{
  className?: string;
  children?: ReactNode;
}> | null {
  let found: React.ReactElement<{ className?: string; children?: ReactNode }> | null = null;
  Children.forEach(nodes, (child) => {
    if (found !== null) return;
    if (!isValidElement(child)) return;
    const el = child as React.ReactElement<{ className?: string; children?: ReactNode }>;
    if (el.type === "code") {
      found = el;
      return;
    }
    if (el.props.children !== undefined) {
      const inner = findFirstCodeElement(el.props.children);
      if (inner !== null) found = inner;
    }
  });
  return found;
}

function PreRenderer({ children, ...rest }: ComponentPropsWithoutRef<"pre">) {
  const codeEl = findFirstCodeElement(children);
  if (codeEl !== null) {
    const className = codeEl.props.className ?? "";
    const match = /language-([\w+-]+)/.exec(className);
    const lang = match !== null ? match[1] : null;
    const text = extractText(codeEl.props.children).replace(/\n$/, "");
    return <MarkdownCodeBlock code={text} language={lang} />;
  }
  return <pre {...rest}>{children}</pre>;
}

function InlineParagraph({ children }: { children?: ReactNode }) {
  return <span className={styles.inlineParagraph}>{children}</span>;
}

/** 표 안 `<pre class="hljs">` 등 — 기본 스키마는 `*`에 className이 없어 `pre`의 클래스가 전부 제거된다 */
const REHYPE_SANITIZE_SCHEMA: RehypeSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    pre: [["className", /^hljs-/, /^language-/, /^shiki/, /^markdown-/]],
    /** remark-math → rehype-katex: sanitize 단계에서 플레이스홀더만 허용하고, katex는 그 이후에만 실행한다 */
    code: [...(defaultSchema.attributes?.code ?? []), ["className", "math-inline", "math-display"]],
  },
};

/** 블록 마크다운에서만 허용. 인라인(칩 옆) 조각에는 원시 HTML을 넣지 않는다. */
const REHYPE_PLUGINS_BLOCK = [
  rehypeRaw,
  [rehypeSanitize, REHYPE_SANITIZE_SCHEMA] as [typeof rehypeSanitize, typeof REHYPE_SANITIZE_SCHEMA],
  rehypeKatex,
];

export function MarkdownPreview({ content, className, inline = false, variant = "default" }: Props) {
  const innerClass = inline ? styles.markdownInlineRoot : styles.markdown;
  const rootClass = buildCls(innerClass, variant === "compact" && styles.markdownCompact);
  /** 인라인 모드도 동일 정규화(특히 `<br />` → 하드 줄바꿈). 인라인은 rehype-raw를 끄므로 원시 HTML 태그는 글자로만 보인다. */
  const markdownSource = normalizeLlmMarkdown(content);
  const components = inline
    ? { pre: PreRenderer, p: InlineParagraph }
    : { pre: PreRenderer };
  /** 인라인 모드는 칩 옆 문장용이다. `<span>` 안에 `<div>`를 넣으면 HTML이 깨져 줄이 갈라진다. */
  const Root = inline ? "span" : "div";
  const body = (
    <Root className={rootClass}>
      <ReactMarkdown
        remarkPlugins={inline ? [remarkGfm] : [remarkGfm, remarkMath]}
        rehypePlugins={inline ? undefined : REHYPE_PLUGINS_BLOCK}
        components={components}
      >
        {markdownSource}
      </ReactMarkdown>
    </Root>
  );
  if (inline) {
    return className !== undefined && className.length > 0 ? <span className={className}>{body}</span> : body;
  }
  return <div className={className}>{body}</div>;
}
