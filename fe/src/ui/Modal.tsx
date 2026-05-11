// 접근성 기본값을 갖춘 모달 컴포넌트입니다.
"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { buildCls } from "../lib/buildCls";
import { Icon } from "./Icon";
import styles from "./Modal.module.css";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  dialogClassName?: string;
};

export function Modal({ open, title, children, onClose, footer, dialogClassName }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={buildCls(styles.dialog, dialogClassName)} onClose={onClose}>
      <div className={styles.panel} role="document">
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" aria-label="close" onClick={onClose} className={styles.close}>
            <Icon name="close" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer !== undefined ? <footer className={buildCls(styles.footer)}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}
