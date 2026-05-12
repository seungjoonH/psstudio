"use client";

// 데스크톱 사이드바와 모바일 드로어를 포함한 앱 셸 레이아웃입니다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { buildCls } from "../lib/buildCls";
import { Button } from "../ui/Button";
import { useNotificationStream } from "../notifications/useNotificationStream";
import { Icon } from "../ui/Icon";
import styles from "./AppShell.module.css";

export type AppShellNavItem = {
  href: string;
  labelKey: string;
  icon: "home" | "bell" | "group" | "calendar" | "task" | "settings";
};

const NAV_ITEMS: AppShellNavItem[] = [
  { href: "/", labelKey: "shell.nav.home", icon: "home" },
  { href: "/notifications", labelKey: "shell.nav.notifications", icon: "bell" },
  { href: "/groups", labelKey: "shell.nav.groups", icon: "group" },
  { href: "/calendar", labelKey: "shell.nav.calendar", icon: "calendar" },
  { href: "/assignments", labelKey: "shell.nav.assignments", icon: "task" },
  { href: "/me", labelKey: "shell.nav.profile", icon: "settings" },
];


function AppShellBrandMark() {
  return (
    <span className={styles.brandMarkWrap} aria-hidden="true">
      <img src="/icons/logo.svg" alt="" className={buildCls(styles.brandMark, styles.brandMarkLight)} />
      <img src="/icons/logo-dark.svg" alt="" className={buildCls(styles.brandMark, styles.brandMarkDark)} />
    </span>
  );
}

type Vars = Record<string, string | number>;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

function readClientApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL 환경변수가 필요합니다.");
  }
  return value;
}

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
  const [liveUnread, setLiveUnread] = useState(unread ?? 0);
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

  useEffect(() => {
    let cancelled = false;
    async function refreshUnread() {
      try {
        const res = await fetch(`${readClientApiBaseUrl()}/api/v1/users/me/notifications/unread-count`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          if (!cancelled) setLiveUnread(0);
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { success: boolean; data?: { count?: unknown } };
        if (!cancelled) {
          setLiveUnread(typeof body.data?.count === "number" ? body.data.count : 0);
        }
      } catch {
        if (!cancelled) setLiveUnread(0);
      }
    }
    void refreshUnread();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useNotificationStream(() => {
    void (async () => {
      try {
        const res = await fetch(`${readClientApiBaseUrl()}/api/v1/users/me/notifications/unread-count`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401) {
          setLiveUnread(0);
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { success: boolean; data?: { count?: unknown } };
        setLiveUnread(typeof body.data?.count === "number" ? body.data.count : 0);
      } catch {
        setLiveUnread(0);
      }
    })();
  });

  const unreadCount = liveUnread;

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar} aria-label={t("shell.sidebarAria")}>
        <div className={styles.brand}>
          <AppShellBrandMark />
          <div className={styles.brandText}>
            <span className={styles.brandName}>{t("common.appName")}</span>
            {APP_VERSION !== undefined ? <span className={styles.brandVersion}>v{APP_VERSION}</span> : null}
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = activeHref !== null && activeHref === item.href;
            const showUnread = item.href === "/notifications" && unreadCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={buildCls(styles.navLink, active ? styles.navLinkActive : "")}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navIconWrap}>
                  <Icon name={item.icon} />
                  {showUnread ? (
                    <span className={styles.navUnreadBadge} aria-hidden="true">
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </span>
                  ) : null}
                </span>
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
            <div className={styles.brandText}>
              <span className={styles.brandName}>{t("common.appName")}</span>
              {APP_VERSION !== undefined ? <span className={styles.brandVersion}>v{APP_VERSION}</span> : null}
            </div>
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
            const showUnread = item.href === "/notifications" && unreadCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={buildCls(styles.navLink, active ? styles.navLinkActive : "")}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navIconWrap}>
                  <Icon name={item.icon} />
                  {showUnread ? (
                    <span className={styles.navUnreadBadge} aria-hidden="true">
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </span>
                  ) : null}
                </span>
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
