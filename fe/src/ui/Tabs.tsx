// 탭 컴포넌트입니다.
"use client";

import type { ReactNode } from "react";
import { buildCls } from "../lib/buildCls";
import styles from "./Tabs.module.css";

export type TabItem = {
  id: string;
  label: string;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  children: ReactNode;
};

export function Tabs({ items, value, onChange, children }: TabsProps) {
  return (
    <div className={styles.root}>
      <div className={styles.tabList} role="tablist" aria-label="tabs">
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={buildCls(styles.tab, selected ? styles.tabActive : "")}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className={styles.panel} role="tabpanel">
        {children}
      </div>
    </div>
  );
}
