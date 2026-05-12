"use client";

// 초대 코드·초대 링크를 한 화면에서 관리합니다.
import { useState } from "react";
import type { InviteCodeResponse, InviteLinkRow } from "../../../../src/invites/server";
import { formatKstDateTime } from "../../../../src/i18n/formatDateTime";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import { Badge } from "../../../../src/ui/Badge";
import { SubmitButton } from "../../../../src/ui/SubmitButton";
import { Tabs } from "../../../../src/ui/Tabs";
import styles from "./InviteManageClient.module.css";

type Actions = {
  regenerateCode: (groupId: string) => Promise<void>;
  createLink: (groupId: string) => Promise<void>;
  revokeLink: (groupId: string, linkId: string) => Promise<void>;
};

type Props = {
  groupId: string;
  inviteCode: InviteCodeResponse;
  links: InviteLinkRow[];
  actions: Actions;
};

export function InviteManageClient({ groupId, inviteCode, links, actions }: Props) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<"code" | "links">("code");

  return (
    <Tabs
      value={tab}
      onChange={(id) => setTab(id as typeof tab)}
      items={[
        { id: "code", label: t("invite.tabs.code") },
        { id: "links", label: t("invite.tabs.links", { count: links.length }) },
      ]}
    >
      {tab === "code" ? (
        <div className={styles.section}>
          <p className={styles.lead}>{t("invite.code.lead")}</p>
          <div className={styles.codeRow}>
            <code className={styles.code}>{inviteCode.code}</code>
            <form action={() => actions.regenerateCode(groupId)}>
              <SubmitButton variant="secondary">
                {t("invite.code.regen")}
              </SubmitButton>
            </form>
          </div>
          <p className={styles.note}>{t("invite.code.note")}</p>
        </div>
      ) : null}

      {tab === "links" ? (
        <div className={styles.section}>
          <p className={styles.lead}>{t("invite.links.lead")}</p>
          <form action={() => actions.createLink(groupId)}>
            <SubmitButton variant="primary">
              {t("invite.links.create")}
            </SubmitButton>
          </form>
          <ul className={styles.linkList}>
            {links.map((l) => (
              <li key={l.id} className={styles.linkRow}>
                <div className={styles.linkInfo}>
                  <code className={styles.linkUrl}>{l.url}</code>
                  <div className={styles.linkMeta}>
                    <Badge tone="success">{t("invite.links.active")}</Badge>
                    <span>
                      {t("invite.links.created", { date: formatKstDateTime(l.createdAt, locale) })}
                    </span>
                  </div>
                </div>
                <form action={() => actions.revokeLink(groupId, l.id)}>
                  <SubmitButton variant="danger">
                    {t("invite.links.revoke")}
                  </SubmitButton>
                </form>
              </li>
            ))}
            {links.length === 0 ? (
              <li className={styles.empty}>{t("invite.links.empty")}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </Tabs>
  );
}
