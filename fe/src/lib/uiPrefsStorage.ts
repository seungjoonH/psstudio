// 클라이언트 우선 UI 설정(테마·로케일) 키, 쿠키 동기화, HTML 부트스트랩 스크립트를 공유합니다.
import { LOCALES, type Locale } from "../i18n/messages";

export const UI_PREFS_THEME_STORAGE_KEY = "psstudio.theme";
export const UI_PREFS_LOCALE_STORAGE_KEY = "psstudio.locale";
export const UI_PREFS_THEME_COOKIE = "psstudio.theme";
export const UI_PREFS_LOCALE_COOKIE = "psstudio.locale";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export type ThemePreference = "system" | "light" | "dark";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function parseStoredLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  return (LOCALES as readonly string[]).includes(value) ? (value as Locale) : null;
}

export function parseStoredTheme(value: string | null | undefined): ThemePreference | null {
  if (!value) return null;
  return isThemePreference(value) ? value : null;
}

/** 브라우저에서만 호출. localStorage와 HttpOnly가 아닌 UI용 쿠키를 함께 갱신합니다. */
export function persistThemePreference(next: ThemePreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UI_PREFS_THEME_STORAGE_KEY, next);
  document.cookie = `${UI_PREFS_THEME_COOKIE}=${encodeURIComponent(next)};Path=/;Max-Age=${COOKIE_MAX_AGE_SEC};SameSite=Lax`;
}

export function persistLocale(next: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UI_PREFS_LOCALE_STORAGE_KEY, next);
  document.cookie = `${UI_PREFS_LOCALE_COOKIE}=${encodeURIComponent(next)};Path=/;Max-Age=${COOKIE_MAX_AGE_SEC};SameSite=Lax`;
}

/**
 * `<head>` 초기 실행용. React 하이드레이션 전에 `data-theme`·`lang`을 맞춰 깜빡임을 줄입니다.
 * 저장값이 없거나 system이면 `prefers-color-scheme`으로 해석합니다.
 */
export function getUiPrefsBootstrapInlineScript(): string {
  const kt = UI_PREFS_THEME_STORAGE_KEY;
  const kl = UI_PREFS_LOCALE_STORAGE_KEY;
  return `!function(){try{var d=document.documentElement;var t=localStorage.getItem("${kt}");var r;if(t==="dark"||t==="light"){r=t;}else{r=window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";}d.dataset.theme=r;var l=localStorage.getItem("${kl}");if(l==="ko"||l==="en"){d.lang=l;}}catch(e){}}();`;
}
