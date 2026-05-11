// 공개 랜딩 페이지의 SEO 메타데이터와 구조화 데이터를 제공합니다.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, messages, type Locale } from "../../src/i18n/messages";
import { fetchMeServer } from "../../src/auth/api.server";
import { UI_PREFS_LOCALE_COOKIE } from "../../src/lib/uiPrefsStorage";
import { LandingClient } from "./LandingClient";
import { resolveSiteOrigin } from "./resolve-site-origin";

const LANDING_PATH = "/landing";

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

async function landingLocaleFromCookie(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get(UI_PREFS_LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

function landingSeoStrings(locale: Locale) {
  return messages[locale].landing;
}

function localeTagBcp47(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : "en-US";
}

function openGraphLocale(locale: Locale): string {
  return locale === "ko" ? "ko_KR" : "en_US";
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await landingLocaleFromCookie();
  const seo = landingSeoStrings(locale);
  const metadataBase = await resolveSiteOrigin();
  const keywords = seo.metaKeywords.split(",").map((s) => s.trim()).filter(Boolean);
  const pageUrl = new URL(LANDING_PATH, metadataBase).href;

  return {
    metadataBase,
    title: seo.metaTitle,
    description: seo.metaDescription,
    keywords,
    alternates: {
      canonical: LANDING_PATH,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      locale: openGraphLocale(locale),
      url: pageUrl,
      siteName: messages[locale].common.appName,
      title: seo.metaTitle,
      description: seo.metaDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.metaTitle,
      description: seo.metaDescription,
    },
  };
}

export default async function LandingPage() {
  const me = await fetchMeServer();
  const locale = await landingLocaleFromCookie();
  const origin = await resolveSiteOrigin();
  const seo = landingSeoStrings(locale);
  const pageUrl = new URL(LANDING_PATH, origin).href;
  const siteUrl = origin.href.replace(/\/$/, "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: seo.metaTitle,
    description: seo.metaDescription,
    inLanguage: localeTagBcp47(locale),
    isPartOf: {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: messages[locale].common.appName,
      url: siteUrl,
    },
    about: {
      "@type": "SoftwareApplication",
      name: messages[locale].common.appName,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      description: seo.metaDescription,
      url: siteUrl,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- 구조화 데이터(JSON-LD)는 표준 삽입 방식입니다.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingClient isLoggedIn={me !== null} />
    </>
  );
}
