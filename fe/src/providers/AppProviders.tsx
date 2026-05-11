"use client";

// 앱 전역 Provider를 한 곳에서 조합합니다.
import { Suspense, type ReactNode } from "react";
import type { Locale } from "../i18n/messages";
import { I18nProvider } from "../i18n/I18nProvider";
import type { ThemePreference } from "../lib/uiPrefsStorage";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SiteFooter } from "../shell/SiteFooter";
import { NavigationPendingOverlay } from "./NavigationPendingOverlay";

export function AppProviders({
  children,
  serverLocale,
  serverThemePreference,
}: {
  children: ReactNode;
  serverLocale?: Locale | null;
  serverThemePreference?: ThemePreference | null;
}) {
  return (
    <QueryProvider>
      <ThemeProvider serverThemePreference={serverThemePreference}>
        <I18nProvider serverLocale={serverLocale}>
          <div className="app-root">
            <div className="app-main">{children}</div>
            <SiteFooter />
          </div>
        </I18nProvider>
        <Suspense fallback={null}>
          <NavigationPendingOverlay />
        </Suspense>
      </ThemeProvider>
    </QueryProvider>
  );
}
