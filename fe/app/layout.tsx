// 앱 공통 레이아웃과 메타데이터를 정의합니다.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "../src/i18n/messages";
import {
  getUiPrefsBootstrapInlineScript,
  parseStoredLocale,
  parseStoredTheme,
  UI_PREFS_LOCALE_COOKIE,
  UI_PREFS_THEME_COOKIE,
} from "../src/lib/uiPrefsStorage";
import { AppProviders } from "../src/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "PS Studio",
  description: "Group-based algorithm study platform",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const serverLocale = parseStoredLocale(jar.get(UI_PREFS_LOCALE_COOKIE)?.value ?? null);
  const serverThemePreference = parseStoredTheme(jar.get(UI_PREFS_THEME_COOKIE)?.value ?? null);
  const htmlLang: Locale = serverLocale ?? DEFAULT_LOCALE;

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <body>
        <Script
          id="psstudio-ui-prefs-boot"
          strategy="beforeInteractive"
          // eslint-disable-next-line react/no-danger -- beforeInteractive 인라인 부트스트랩입니다.
          dangerouslySetInnerHTML={{ __html: getUiPrefsBootstrapInlineScript() }}
        />
        <AppProviders serverLocale={serverLocale} serverThemePreference={serverThemePreference}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
