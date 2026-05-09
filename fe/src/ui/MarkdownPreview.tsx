// Markdown 본문을 공통 스타일로 렌더링하는 프리뷰 컴포넌트입니다.
"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import styles from "./MarkdownPreview.module.css";

type Props = {
  content: string;
  className?: string;
  /** true면 문단·칩과 같은 줄에 끼워 넣을 때 쓴다(<p>를 인라인 처리). */
  inline?: boolean;
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

function PreRenderer({ children, ...rest }: ComponentPropsWithoutRef<"pre">) {
  let codeChild: ReactNode = null;
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    codeChild = children;
  }
  if (codeChild !== null && isValidElement<{ className?: string; children?: ReactNode }>(codeChild)) {
    const className = codeChild.props.className ?? "";
    const match = /language-([\w+-]+)/.exec(className);
    if (match !== null) {
      const text = extractText(codeChild.props.children).replace(/\n$/, "");
      return <MarkdownCodeBlock code={text} language={match[1]} />;
    }
  }
  return <pre {...rest}>{children}</pre>;
}

function InlineParagraph({ children }: { children?: ReactNode }) {
  return <span className={styles.inlineParagraph}>{children}</span>;
}

/** 블록 마크다운에서만 허용. 인라인(칩 옆) 조각에는 원시 HTML을 넣지 않는다. */
const REHYPE_PLUGINS_BLOCK = [rehypeRaw, rehypeSanitize];

export function MarkdownPreview({ content, className, inline = false }: Props) {
  const innerClass = inline ? styles.markdownInlineRoot : styles.markdown;
  const components = inline
    ? { pre: PreRenderer, p: InlineParagraph }
    : { pre: PreRenderer };
  /** 인라인 모드는 칩 옆 문장용이다. `<span>` 안에 `<div>`를 넣으면 HTML이 깨져 줄이 갈라진다. */
  const Root = inline ? "span" : "div";
  const body = (
    <Root className={innerClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={inline ? undefined : REHYPE_PLUGINS_BLOCK}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </Root>
  );
  if (inline) {
    return className !== undefined && className.length > 0 ? <span className={className}>{body}</span> : body;
  }
  return <div className={className}>{body}</div>;
}
