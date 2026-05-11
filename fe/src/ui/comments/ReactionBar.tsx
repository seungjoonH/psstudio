// 댓글 카드 하단에 이모지 카운트와 추가 버튼을 보여주는 컴포넌트입니다.
"use client";

import { useState } from "react";
import { EmojiPicker } from "./EmojiPicker";
import styles from "./ReactionBar.module.css";

export type ReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
};

type Props = {
  reactions: ReactionSummary[];
  onToggle: (emoji: string, reactedByMe: boolean) => void | Promise<void>;
};

export function ReactionBar({ reactions, onToggle }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className={styles.root}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`${styles.chip} ${reaction.reactedByMe ? styles.chipActive : ""}`}
          onClick={() => onToggle(reaction.emoji, reaction.reactedByMe)}
          title={`${reaction.emoji} ${reaction.count}`}
        >
          <span className={styles.chipEmoji}>{reaction.emoji}</span>
          <span className={styles.chipCount}>{reaction.count}</span>
        </button>
      ))}
      <div className={styles.addWrap}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setPickerOpen((prev) => !prev)}
          aria-label="이모지 추가"
        >
          😀<span className={styles.plus}>+</span>
        </button>
        {pickerOpen ? (
          <EmojiPicker
            onPick={(emoji) => {
              const existing = reactions.find((r) => r.emoji === emoji);
              const reactedByMe = existing?.reactedByMe ?? false;
              setPickerOpen(false);
              void onToggle(emoji, reactedByMe);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
