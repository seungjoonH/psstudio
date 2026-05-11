"use client";

// 그룹 서브 탭 우측에 표시할 현재 라우트 브레드크럼입니다.
import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "../../../src/i18n/I18nProvider";
import styles from "./GroupRouteBreadcrumbs.module.css";

export type GroupRouteBreadcrumbsProps = {
  groupId: string;
  /** 과제 하위 화면에서 표시할 과제 제목 */
  assignmentTitle?: string;
  /** 제출 상세 등에서 표시할 제출 제목 */
  submissionTitle?: string;
};

type Crumb = { label: string; href?: string };

function buildCrumbs(
  pathname: string,
  searchParams: URLSearchParams,
  groupId: string,
  assignmentTitle: string | undefined,
  submissionTitle: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): Crumb[] {
  const base = `/groups/${groupId}`;
  const tail = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const parts = tail.split("/").filter(Boolean);

  if (pathname === base || pathname === `${base}/`) {
    const tab = searchParams.get("tab");
    if (tab === "settings") {
      return [{ label: t("groupNav.settings"), href: undefined }];
    }
    return [{ label: t("groupNav.members"), href: undefined }];
  }

  if (parts[0] === "invite") {
    return [{ label: t("groupNav.invite"), href: undefined }];
  }

  if (parts[0] === "calendar") {
    return [{ label: t("groupNav.calendar"), href: undefined }];
  }

  if (parts[0] === "dashboard") {
    return [{ label: t("groupBreadcrumb.dashboard"), href: undefined }];
  }

  if (parts[0] === "dashboard") {
    return [{ label: t("groupBreadcrumb.dashboard"), href: undefined }];
  }

  if (parts[0] === "assignments") {
    const assignmentsRoot = `${base}/assignments`;
    const assignLabel = assignmentTitle ?? t("groupBreadcrumb.assignmentFallback");

    if (parts.length === 1) {
      return [{ label: t("groupNav.assignments"), href: undefined }];
    }

    if (parts[1] === "new") {
      return [
        { label: t("groupNav.assignments"), href: assignmentsRoot },
        { label: t("groupBreadcrumb.newAssignment"), href: undefined },
      ];
    }

    const assignmentId = parts[1];
    const assignmentHref = `${base}/assignments/${assignmentId}`;

    if (parts.length === 2) {
      return [
        { label: t("groupNav.assignments"), href: assignmentsRoot },
        { label: assignLabel, href: undefined },
      ];
    }

    if (parts[2] === "settings") {
      return [
        { label: t("groupNav.assignments"), href: assignmentsRoot },
        { label: assignLabel, href: assignmentHref },
        { label: t("groupBreadcrumb.assignmentSettings"), href: undefined },
      ];
    }

    if (parts[2] === "cohort") {
      return [
        { label: t("groupNav.assignments"), href: assignmentsRoot },
        { label: assignLabel, href: assignmentHref },
        { label: t("groupBreadcrumb.cohortAnalysis"), href: undefined },
      ];
    }

    if (parts[2] === "submissions") {
      if (parts.length === 3) {
        return [
          { label: t("groupNav.assignments"), href: assignmentsRoot },
          { label: assignLabel, href: assignmentHref },
          { label: t("groupBreadcrumb.submissions"), href: undefined },
        ];
      }

      if (parts[3] === "new") {
        return [
          { label: t("groupNav.assignments"), href: assignmentsRoot },
          { label: assignLabel, href: assignmentHref },
          { label: t("groupBreadcrumb.newSubmission"), href: undefined },
        ];
      }

      const submissionId = parts[3];
      const submissionHref = `${base}/assignments/${assignmentId}/submissions/${submissionId}`;
      const subLabel = submissionTitle ?? t("groupBreadcrumb.submissionFallback");

      if (parts[4] === "diff") {
        return [
          { label: t("groupNav.assignments"), href: assignmentsRoot },
          { label: assignLabel, href: assignmentHref },
          { label: subLabel, href: submissionHref },
          { label: t("groupBreadcrumb.diff"), href: undefined },
        ];
      }

      return [
        { label: t("groupNav.assignments"), href: assignmentsRoot },
        { label: assignLabel, href: assignmentHref },
        { label: subLabel, href: undefined },
      ];
    }
  }

  return [{ label: t("groupBreadcrumb.fallback"), href: undefined }];
}

export function GroupRouteBreadcrumbs({
  groupId,
  assignmentTitle,
  submissionTitle,
}: GroupRouteBreadcrumbsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const items = useMemo(
    () =>
      buildCrumbs(pathname, searchParams, groupId, assignmentTitle, submissionTitle, t),
    [pathname, searchParams, groupId, assignmentTitle, submissionTitle, t],
  );

  return (
    <nav className={styles.root} aria-label={t("groupBreadcrumb.ariaLabel")}>
      <ol className={styles.list}>
        {items.map((item, index) => (
          <li key={`${index}-${item.href ?? "current"}-${item.label}`} className={styles.item}>
            {index > 0 ? (
              <span className={styles.sep} aria-hidden>
                ›
              </span>
            ) : null}
            {item.href !== undefined ? (
              <Link href={item.href} className={styles.link}>
                {item.label}
              </Link>
            ) : (
              <span className={styles.current}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
