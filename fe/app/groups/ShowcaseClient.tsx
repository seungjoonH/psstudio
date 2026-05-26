"use client";

// UI 컴포넌트 데모 블록입니다.
import { useState } from "react";
import { useI18n } from "../../src/i18n/I18nProvider";
import { Chip } from "../../src/ui/Chip";
import { Input } from "../../src/ui/Input";
import { Modal } from "../../src/ui/Modal";
import { Tabs } from "../../src/ui/Tabs";
import { ErrorState } from "../../src/ui/states/ErrorState";
import { LoadingState } from "../../src/ui/states/LoadingState";
import styles from "./ShowcaseClient.module.css";

export function ShowcaseClient() {
  const { t } = useI18n();
  const [tab, setTab] = useState("overview");
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.root}>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: t("showcase.overview") },
          { id: "components", label: t("showcase.components") },
        ]}
      >
        {tab === "overview" ? <LoadingState label={t("showcase.loading")} /> : null}
        {tab === "components" ? (
          <div className={styles.panel}>
            <div className={styles.chipRow}>
              <Chip active>{t("showcase.all")}</Chip>
              <Chip>{t("showcase.cpp")}</Chip>
              <Chip>{t("showcase.python")}</Chip>
            </div>
            <Input label={t("showcase.search")} name="q" placeholder={t("showcase.searchPlaceholder")} />
            <ErrorState title={t("showcase.errorTitle")} description={t("showcase.errorDescription")} />
            <button type="button" onClick={() => setOpen(true)}>
              {t("showcase.openModal")}
            </button>
          </div>
        ) : null}
      </Tabs>

      <Modal open={open} title={t("showcase.modalTitle")} onClose={() => setOpen(false)}>
        <p className={styles.modalBody}>{t("showcase.modalBody")}</p>
      </Modal>
    </div>
  );
}
