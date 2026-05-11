"use client";

// 라이트/다크 테마 선택과 시스템 테마 감지를 담당합니다.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  UI_PREFS_THEME_STORAGE_KEY,
  parseStoredTheme,
  persistThemePreference,
  type ThemePreference,
} from "../lib/uiPrefsStorage";

export type { ThemePreference };

const DARK_QUERY = "(prefers-color-scheme: dark)";

type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function ThemeProvider({
  children,
  serverThemePreference,
}: {
  children: ReactNode;
  /** 쿠키 등 서버에서 읽은 값. 클라이언트에서는 localStorage 적용 뒤 이 값으로 덮어씁니다. */
  serverThemePreference?: ThemePreference | null;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useLayoutEffect(() => {
    const raw = window.localStorage.getItem(UI_PREFS_THEME_STORAGE_KEY);
    const parsed = parseStoredTheme(raw);
    if (parsed !== null) setPreferenceState(parsed);
  }, []);

  useEffect(() => {
    if (serverThemePreference == null) return;
    setPreferenceState(serverThemePreference);
    persistThemePreference(serverThemePreference);
  }, [serverThemePreference]);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const applyTheme = () => {
      const nextTheme = resolveTheme(preference);
      document.documentElement.dataset.theme = nextTheme;
      setResolvedTheme(nextTheme);
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => {
    const setPreference = (nextPreference: ThemePreference) => {
      persistThemePreference(nextPreference);
      setPreferenceState(nextPreference);
    };

    return { preference, resolvedTheme, setPreference };
  }, [preference, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is missing.");
  return value;
}
