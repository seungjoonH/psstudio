// GitHub 스타일의 댓글 카드(아바타·작성자·시간·본문·이모지·답글) 컴포넌트입니다.
"use client";

import { useState, type ReactNode } from "react";
import { MarkdownPreview } from "../MarkdownPreview";
import { UserAvatar } from "../UserAvatar";
import { ReactionBar, type ReactionSummary } from "./ReactionBar";
import styles from "./CommentCard.module.css";

export type CommentReply = {
  id: string;
  authorNickname: string;
  authorProfileImageUrl: string;
  body: string;
  createdAt: string;
  reactions: ReactionSummary[];
};

type CommentToggleHandler = (emoji: string, reactedByMe: boolean) => void | Promise<void>;
type ReplyToggleHandler = (
  replyId: string,
  emoji: string,
  reactedByMe: boolean,
) => void | Promise<void>;

type Props = {
  authorNickname: string;
  authorProfileImageUrl: string;
  createdAt: string;
  body: string;
  header?: ReactNode;
  headerAction?: ReactNode;
  reactions: ReactionSummary[];
  onToggleReaction: CommentToggleHandler;
  replies: CommentReply[];
  onSubmitReply: (body: string) => Promise<void>;
  onToggleReplyReaction: ReplyToggleHandler;
  replyPlaceholder?: string;
  replyDisabled?: boolean;
};

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentCard({
  authorNickname,
  authorProfileImageUrl,
  createdAt,
  body,
  header,
  headerAction,
  reactions,
  onToggleReaction,
  replies,
  onSubmitReply,
  onToggleReplyReaction,
  replyPlaceholder = "답글을 입력하세요.",
  replyDisabled = false,
}: Props) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitReply = async () => {
    const trimmed = replyBody.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmitReply(trimmed);
      setReplyBody("");
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className={styles.card}>
      <div className={styles.row}>
        <UserAvatar nickname={authorNickname} imageUrl={authorProfileImageUrl} size={36} />
        <div className={styles.body}>
          <div className={styles.headRow}>
            <strong className={styles.author}>{authorNickname}</strong>
            <span className={styles.time}>{formatRelative(createdAt)}</span>
            {headerAction !== undefined ? (
              <span className={styles.headAction}>{headerAction}</span>
            ) : null}
          </div>
          {header !== undefined ? <div className={styles.subHead}>{header}</div> : null}
          <div className={styles.markdownWrap}>
            <MarkdownPreview content={body} variant="compact" />
          </div>
          <ReactionBar reactions={reactions} onToggle={onToggleReaction} />
        </div>
      </div>

      {replies.length > 0 ? (
        <div className={styles.replies}>
          {replies.map((reply) => (
            <div key={reply.id} className={styles.replyRow}>
              <UserAvatar nickname={reply.authorNickname} imageUrl={reply.authorProfileImageUrl} size={28} />
              <div className={styles.replyBody}>
                <div className={styles.headRow}>
                  <strong className={styles.author}>{reply.authorNickname}</strong>
                  <span className={styles.time}>{formatRelative(reply.createdAt)}</span>
                </div>
                <div className={styles.markdownWrap}>
                  <MarkdownPreview content={reply.body} variant="compact" />
                </div>
                <ReactionBar
                  reactions={reply.reactions}
                  onToggle={(emoji, reactedByMe) =>
                    onToggleReplyReaction(reply.id, emoji, reactedByMe)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {replyDisabled ? null : (
        <div className={styles.replyFooter}>
          {replyOpen ? (
            <div className={styles.replyForm}>
              <textarea
                className={styles.replyTextarea}
                rows={3}
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                placeholder={replyPlaceholder}
                autoFocus
              />
              <div className={styles.replyActions}>
                <button
                  type="button"
                  className={styles.replyCancelBtn}
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyBody("");
                  }}
                  disabled={submitting}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.replySubmitBtn}
                  onClick={submitReply}
                  disabled={submitting || replyBody.trim().length === 0}
                >
                  답글
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.replyOpenBtn}
              onClick={() => setReplyOpen(true)}
            >
              답글 달기
            </button>
          )}
        </div>
      )}
    </article>
  );
}
