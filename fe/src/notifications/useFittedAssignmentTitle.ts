// 알림 제목 컨테이너 높이에 맞춰 과제명 표시 길이를 조정합니다.
import { useLayoutEffect, useState } from "react";
import {
  NOTIFICATION_TITLE_MAX_LINES,
  findMaxVisibleAssignmentTitleLength,
  truncateAssignmentTitleChars,
} from "./fitAssignmentTitleInNotification";
import styles from "./NotificationTitle.module.css";

export function useFittedAssignmentTitle(
  containerRef: React.RefObject<HTMLParagraphElement | null>,
  assignmentTitle: string,
): string {
  const [fittedTitle, setFittedTitle] = useState(assignmentTitle);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const titleEl = container.querySelector<HTMLElement>("[data-assignment-title]");
    if (!titleEl) {
      return;
    }

    const fit = () => {
      const style = getComputedStyle(container);
      const lineHeight = parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        setFittedTitle(assignmentTitle);
        return;
      }

      const maxHeight = lineHeight * NOTIFICATION_TITLE_MAX_LINES + 1;
      container.classList.add(styles.measuring);

      const applyVisibleLength = (visibleLength: number) => {
        titleEl.textContent =
          visibleLength >= assignmentTitle.length
            ? assignmentTitle
            : truncateAssignmentTitleChars(assignmentTitle, visibleLength);
      };

      try {
        applyVisibleLength(assignmentTitle.length);
        if (container.scrollHeight <= maxHeight) {
          setFittedTitle(titleEl.textContent);
          return;
        }

        const visibleLength = findMaxVisibleAssignmentTitleLength(
          (length) => {
            applyVisibleLength(length);
            return container.scrollHeight <= maxHeight;
          },
          assignmentTitle.length,
        );

        applyVisibleLength(visibleLength);
        setFittedTitle(titleEl.textContent);
      } finally {
        container.classList.remove(styles.measuring);
      }
    };

    fit();

    const observer = new ResizeObserver(() => fit());
    observer.observe(container);
    const parent = container.parentElement;
    if (parent) {
      observer.observe(parent);
    }

    return () => observer.disconnect();
  }, [containerRef, assignmentTitle]);

  return fittedTitle;
}
