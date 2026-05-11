// Button 컴포넌트 렌더링 단위 테스트입니다.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  it("children을 텍스트로 렌더링한다", () => {
    render(<Button>저장</Button>);
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
  });

  it("variant prop을 클래스로 적용한다", () => {
    render(<Button variant="primary">확인</Button>);
    const btn = screen.getByRole("button", { name: "확인" });
    expect(btn.className).toMatch(/primary/);
  });

  it("disabled 상태에서 onClick이 호출되지 않는다", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        삭제
      </Button>,
    );
    screen.getByRole("button", { name: "삭제" }).click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
