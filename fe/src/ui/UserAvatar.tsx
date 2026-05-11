// 닉네임 첫 글자 기반의 기본 프로필 아바타를 렌더하는 공용 컴포넌트입니다.
"use client";

import { useState } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./UserAvatar.module.css";

type Props = {
  nickname: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
};

function initialChar(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function toneIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 8;
}

export function UserAvatar({ nickname, imageUrl, size = 36, className }: Props) {
  const [errored, setErrored] = useState(false);
  const hasImage = !!imageUrl && imageUrl.length > 0 && !errored;

  if (!hasImage) {
    const tone = `tone${toneIndex(nickname)}` as const;
    return (
      <div
        className={buildCls(
          styles.fallback,
          styles[tone as keyof typeof styles],
          className,
        )}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(11, Math.round(size * 0.42)),
        }}
        aria-label={nickname}
        role="img"
      >
        {initialChar(nickname)}
      </div>
    );
  }

  return (
    <img
      src={imageUrl ?? ""}
      alt={nickname}
      width={size}
      height={size}
      className={buildCls(styles.image, className)}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
    />
  );
}
