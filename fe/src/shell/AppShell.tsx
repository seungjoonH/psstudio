"use client";

// 데스크톱 사이드바와 모바일 드로어를 포함한 앱 셸 레이아웃입니다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { buildCls } from "../lib/buildCls";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./AppShell.module.css";

export type AppShellNavItem = {
  href: string;
  labelKey: string;
  icon: "home" | "users" | "calendar" | "book" | "user";
};

const NAV_ITEMS: AppShellNavItem[] = [
  { href: "/", labelKey: "shell.nav.home", icon: "home" },
  { href: "/groups", labelKey: "shell.nav.groups", icon: "users" },
  { href: "/calendar", labelKey: "shell.nav.calendar", icon: "calendar" },
  { href: "/assignments", labelKey: "shell.nav.assignments", icon: "book" },
  { href: "/me", labelKey: "shell.nav.profile", icon: "user" },
];

/** 라이트·다크 테마에 맞춰 `/icons/logo.svg`와 `logo-dark.svg`를 전환합니다. */
function AppShellBrandMark() {
  return (
    <span className={styles.brandMarkWrap} aria-hidden="true">
      <img src="/icons/logo.svg" alt="" className={buildCls(styles.brandMark, styles.brandMarkLight)} />
      <img src="/icons/logo-dark.svg" alt="" className={buildCls(styles.brandMark, styles.brandMarkDark)} />
    </span>
  );
}

type Vars = Record<string, string | number>;

type AppShellProps = {
  children: ReactNode;
  title?: string;
  titleKey?: string;
  titleVars?: Vars;
  subtitle?: string;
  subtitleKey?: string;
  subtitleVars?: Vars;
  actions?: ReactNode;
  unread?: number;
};

export function AppShell({
  children,
  title,
  titleKey,
  titleVars,
  subtitle,
  subtitleKey,
  subtitleVars,
  actions,
  unread,
}: AppShellProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const resolvedTitle =
    title ?? (titleKey !== undefined ? t(titleKey, titleVars) : t("shell.defaultTitle"));
  const resolvedSubtitle =
    subtitle ?? (subtitleKey !== undefined ? t(subtitleKey, subtitleVars) : undefined);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeHref = useMemo(() => {
    const exact = NAV_ITEMS.find((item) => item.href === pathname)?.href;
    if (exact !== undefined) return exact;
    const prefix = NAV_ITEMS.filter((item) => item.href !== "/").find((item) => pathname.startsWith(item.href));
    return prefix?.href ?? null;
  }, [pathname]);

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar} aria-label={t("shell.sidebarAria")}>
        <div className={styles.brand}>
          <AppShellBrandMark />
          <span className={styles.brandName}>{t("common.appName")}</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = activeHref !== null && activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={buildCls(styles.navLink, active ? styles.navLinkActive : "")}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <Button
              variant="ghost"
              type="button"
              className={styles.iconOnly}
              aria-label={t("shell.openMenu")}
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" />
            </Button>
            <div className={styles.titles}>
              <div className={styles.titleRow}>
                <h1 className={styles.pageTitle}>{resolvedTitle}</h1>
                {unread !== undefined && unread > 0 ? (
                  <Badge tone="danger" className={styles.unreadBadge}>
                    {unread > 99 ? "99+" : String(unread)}
                  </Badge>
                ) : null}
              </div>
              {resolvedSubtitle !== undefined ? (
                <p className={styles.subtitle}>{resolvedSubtitle}</p>
              ) : null}
            </div>
          </div>

          <div className={styles.topRight}>
            {actions !== undefined ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        </header>

        <section className={styles.content}>{children}</section>
      </div>

      {mobileOpen ? (
        <div className={styles.drawerBackdrop} role="presentation" onClick={() => setMobileOpen(false)} />
      ) : null}
      <aside className={buildCls(styles.drawer, mobileOpen ? styles.drawerOpen : "")} aria-hidden={!mobileOpen}>
        <div className={styles.drawerHeader}>
          <div className={styles.brand}>
            <AppShellBrandMark />
            <span className={styles.brandName}>{t("common.appName")}</span>
          </div>
          <Button
            variant="ghost"
            type="button"
            className={styles.iconOnly}
            aria-label={t("shell.closeMenu")}
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="close" />
          </Button>
        </div>
        <nav className={styles.drawerNav}>
          {NAV_ITEMS.map((item) => {
            const active = activeHref !== null && activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={buildCls(styles.navLink, active ? styles.navLinkActive : "")}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
