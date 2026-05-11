"use client";

// 클라이언트 언어 선택과 번역 조회 Context를 제공합니다.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UI_PREFS_LOCALE_STORAGE_KEY, parseStoredLocale, persistLocale } from "../lib/uiPrefsStorage";
import { DEFAULT_LOCALE, FALLBACK_LOCALE, messages, type Locale } from "./messages";

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Vars) => string;
};

function format(template: string, vars?: Vars) {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveMessage(locale: Locale, key: string) {
  const parts = key.split(".");
  let current: unknown = messages[locale];

  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : null;
}

export function I18nProvider({
  children,
  serverLocale,
}: {
  children: ReactNode;
  /** 쿠키 등 서버에서 읽은 값. 클라이언트에서는 localStorage 적용 뒤 이 값으로 덮어씁니다. */
  serverLocale?: Locale | null;
}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useLayoutEffect(() => {
    const raw = window.localStorage.getItem(UI_PREFS_LOCALE_STORAGE_KEY);
    const parsed = parseStoredLocale(raw);
    if (parsed !== null) setLocaleState(parsed);
  }, []);

  useEffect(() => {
    if (serverLocale == null) return;
    setLocaleState(serverLocale);
    persistLocale(serverLocale);
  }, [serverLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const setLocale = (nextLocale: Locale) => {
      persistLocale(nextLocale);
      setLocaleState(nextLocale);
    };

    const t = (key: string, vars?: Vars) => {
      const raw = resolveMessage(locale, key) ?? resolveMessage(FALLBACK_LOCALE, key) ?? key;
      return format(raw, vars);
    };

    return { locale, setLocale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing.");
  return value;
}
