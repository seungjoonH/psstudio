"use client";

// 그룹 내부 화면 공통 서브 네비게이션입니다.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { buildCls } from "../../../src/lib/buildCls";
import styles from "./GroupContextNav.module.css";

type Props = {
  groupId: string;
  embedded?: boolean;
};

const getRootSegment = (path: string): "members" | "settings" | "calendar" | "assignments" | "invite" | "dashboard" => {
  const marker = `/groups/`;
  const idx = path.indexOf(marker);
  if (idx < 0) return "members";
  const tail = path.slice(idx + marker.length);
  const parts = tail.split("/").filter(Boolean);
  if (parts.length < 2) return "members";
  const seg = parts[1];
  if (seg === "dashboard") return "dashboard";
  if (seg === "calendar") return "calendar";
  if (seg === "assignments") return "assignments";
  if (seg === "members") return "members";
  if (seg === "settings") return "settings";
  if (seg === "invite") return "invite";
  return "members";
};

export function GroupContextNav({ groupId, embedded = false }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = getRootSegment(pathname);
  const tab = searchParams.get("tab");
  const tabSection = tab === "settings" ? "settings" : "members";
  const activeForGroupHome = pathname === `/groups/${groupId}` ? tabSection : active;

  const items = [
    { id: "dashboard", href: `/groups/${groupId}/dashboard`, label: t("groupNav.dashboard") },
    { id: "calendar", href: `/groups/${groupId}/calendar`, label: t("groupNav.calendar") },
    { id: "assignments", href: `/groups/${groupId}/assignments`, label: t("groupNav.assignments") },
    { id: "members", href: `/groups/${groupId}?tab=members`, label: t("groupNav.members") },
    { id: "settings", href: `/groups/${groupId}?tab=settings`, label: t("groupNav.settings") },
  ];

  return (
    <nav
      className={buildCls(styles.root, embedded ? styles.embedded : undefined)}
      aria-label={t("groupNav.ariaLabel")}
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={buildCls(styles.link, activeForGroupHome === item.id ? styles.active : "")}
          aria-current={activeForGroupHome === item.id ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
