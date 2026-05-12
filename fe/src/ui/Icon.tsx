// SVG 스프라이트 아이콘을 렌더링하는 컴포넌트입니다.
import type { SVGAttributes } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Icon.module.css";

export type IconName =
  | "menu"
  | "close"
  | "home"
  | "group"
  | "users"
  | "calendar"
  | "task"
  | "book"
  | "user"
  | "settings"
  | "bell"
  | "chevronRight"
  | "key"
  | "link"
  | "userPlus"
  | "mail"
  | "plus"
  | "compass"
  | "copy"
  | "done"
  | "check"
  | "sparkles"
  | "bot"
  | "externalLink"
  | "edit"
  | "save"
  | "filter"
  | "google"
  | "github";

type IconProps = {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
} & Omit<SVGAttributes<SVGSVGElement>, "children" | "width" | "height">;

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const ariaHidden = label === undefined;
  return (
    <svg
      {...rest}
      className={buildCls(styles.icon, className)}
      width={size}
      height={size}
      role={ariaHidden ? "presentation" : undefined}
      aria-hidden={ariaHidden ? true : undefined}
      aria-label={label}
      focusable="false"
    >
      <use href={`/icons/icons.svg#${name}`} />
    </svg>
  );
}
