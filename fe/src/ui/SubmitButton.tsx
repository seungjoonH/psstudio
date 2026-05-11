"use client";

// 서버 액션 폼 제출 중 로딩 표시를 연동하는 제출 전용 버튼입니다.
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

export type SubmitButtonProps = Omit<ButtonProps, "type" | "loading">;

export function SubmitButton({ disabled, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" disabled={Boolean(disabled) || pending} loading={pending} />
  );
}
