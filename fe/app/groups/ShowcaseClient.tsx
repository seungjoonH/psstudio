"use client";

// UI 컴포넌트 데모 블록입니다.
import { useState } from "react";
import { Chip } from "../../src/ui/Chip";
import { Input } from "../../src/ui/Input";
import { Modal } from "../../src/ui/Modal";
import { Tabs } from "../../src/ui/Tabs";
import { ErrorState } from "../../src/ui/states/ErrorState";
import { LoadingState } from "../../src/ui/states/LoadingState";

export function ShowcaseClient() {
  const [tab, setTab] = useState("overview");
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "components", label: "Components" },
        ]}
      >
        {tab === "overview" ? <LoadingState label="Loading data." /> : null}
        {tab === "components" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip active>All</Chip>
              <Chip>C++</Chip>
              <Chip>Python</Chip>
            </div>
            <Input label="Search" name="q" placeholder="Search group name" />
            <ErrorState title="Demo error" description="Keeps the same tone as real API errors." />
            <button type="button" onClick={() => setOpen(true)}>
              Open modal
            </button>
          </div>
        ) : null}
      </Tabs>

      <Modal open={open} title="Modal demo" onClose={() => setOpen(false)}>
        <p style={{ margin: 0 }}>This modal is built with CSS Modules.</p>
      </Modal>
    </div>
  );
}
