// 자유 이모지 선택을 위한 단순 picker 컴포넌트입니다.
"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./EmojiPicker.module.css";

const POPULAR_EMOJIS = [
  "👍",
  "👎",
  "❤️",
  "🎉",
  "😄",
  "😂",
  "😢",
  "😮",
  "😡",
  "🤔",
  "🙏",
  "🔥",
  "💯",
  "✨",
  "🚀",
  "💡",
  "🎯",
  "✅",
  "❌",
  "⚠️",
  "📌",
  "🎨",
  "🎁",
  "⭐",
  "💪",
  "👏",
  "🤝",
  "☕",
  "🍕",
  "🌟",
  "❗",
  "❓",
  "👀",
  "🙌",
  "💖",
  "🥳",
];

type Props = {
  onPick: (emoji: string) => void;
  onClose: () => void;
  placeholder?: string;
};

export function EmojiPicker({ onPick, onClose, placeholder = "이모지를 직접 입력" }: Props) {
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current === null) return;
      if (!ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={styles.popover} role="dialog">
      <div className={styles.grid}>
        {POPULAR_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={styles.cell}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form
        className={styles.customRow}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = custom.trim();
          if (trimmed.length === 0) return;
          onPick(trimmed);
          setCustom("");
        }}
      >
        <input
          type="text"
          className={styles.customInput}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder={placeholder}
          maxLength={32}
        />
        <button type="submit" className={styles.customSubmit}>
          추가
        </button>
      </form>
    </div>
  );
}
