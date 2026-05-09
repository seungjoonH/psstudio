"use client";

// 그룹 상세 화면의 멤버 목록과 관리 액션을 그립니다.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "../../../src/i18n/I18nProvider";
import type { InviteLinkRow, JoinRequestRow } from "../../../src/invites/server";
import { Badge } from "../../../src/ui/Badge";
import { Button } from "../../../src/ui/Button";
import { SubmitButton } from "../../../src/ui/SubmitButton";
import { Icon } from "../../../src/ui/Icon";
import { Modal } from "../../../src/ui/Modal";
import { SegmentedControl } from "../../../src/ui/SegmentedControl";
import { Switch } from "../../../src/ui/Switch";
import { UserAvatar } from "../../../src/ui/UserAvatar";
import { LAST_GROUP_COOKIE, LAST_GROUP_MAX_AGE_SEC } from "../../../src/groups/lastGroupCookie";
import type { GroupDetail, GroupMember } from "../../../src/groups/server";
import { GroupSubnavCluster } from "./GroupSubnavCluster";
import { GroupRouteBreadcrumbs } from "./GroupRouteBreadcrumbs";
import styles from "./GroupDetailClient.module.css";

type Actions = {
  updateGroup: (groupId: string, formData: FormData) => Promise<void>;
  regenerateGroupCode: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string, formData: FormData) => Promise<void>;
  changeRole: (groupId: string, userId: string, role: "MANAGER" | "MEMBER") => Promise<void>;
  transferOwner: (groupId: string, userId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  decideJoin: (groupId: string, requestId: string, decision: "APPROVED" | "REJECTED") => Promise<void>;
};

type Props = {
  meId: string;
  group: GroupDetail;
  members: GroupMember[];
  links: InviteLinkRow[];
  joinRequests: JoinRequestRow[];
  actions: Actions;
};

export function GroupDetailClient({ meId, group, members, links, joinRequests, actions }: Props) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [creatorRole, setCreatorRole] = useState(group.rules.assignmentCreatorRoles);
  const [deadlineTime, setDeadlineTime] = useState(group.rules.defaultDeadlineTime);
  const searchParams = useSearchParams();

  const myRole = group.myRole;
  const canManage = myRole === "OWNER" || myRole === "MANAGER";
  const isOwner = myRole === "OWNER";
  const creatorRoleOptions = useMemo(
    () => [
      { value: "OWNER_ONLY", label: t("groupNew.rules.creator.ownerOnly") },
      { value: "OWNER_AND_MANAGER", label: t("groupNew.rules.creator.both") },
    ],
    [t],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem("psstudio:lastGroupId", group.id);
      document.cookie = `${LAST_GROUP_COOKIE}=${encodeURIComponent(group.id)};path=/;max-age=${LAST_GROUP_MAX_AGE_SEC};SameSite=Lax`;
    } catch {
      // 저장소·쿠키 접근 불가 시 무시합니다.
    }
  }, [group.id]);

  useEffect(() => {
    if (!codeCopied) return;
    const timer = window.setTimeout(() => setCodeCopied(false), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCopied]);

  useEffect(() => {
    if (copiedLinkId === null) return;
    const timer = window.setTimeout(() => setCopiedLinkId(null), 1000);
    return () => window.clearTimeout(timer);
  }, [copiedLinkId]);

  const activeSection: "members" | "settings" = searchParams.get("tab") === "settings" ? "settings" : "members";

  return (
    <div className={styles.root}>
      <GroupSubnavCluster groupId={group.id}>
        <GroupRouteBreadcrumbs groupId={group.id} />
      </GroupSubnavCluster>
      {activeSection === "members" ? (
        <section id="members" className={styles.sectionBlock}>
          <div className={styles.membersGrid}>
            <div className={styles.subSection}>
              <h3 className={styles.blockTitle}>{t("group.tabs.members", { count: members.length })}</h3>
              <ul className={styles.memberList}>
                {members.map((m) => (
                  <li key={m.userId} className={styles.memberRow}>
                    <div className={styles.memberInfo}>
                      <UserAvatar
                        nickname={m.nickname}
                        imageUrl={m.profileImageUrl}
                        size={36}
                        className={styles.avatar}
                      />
                      <div>
                        <div className={styles.nameRow}>
                          <span className={styles.nickname}>{m.nickname}</span>
                          <Badge tone={m.role === "OWNER" ? "warning" : "neutral"}>{m.role}</Badge>
                          {m.userId === meId ? <Badge tone="success">{t("group.meBadge")}</Badge> : null}
                        </div>
                      </div>
                    </div>
                    {canManage && m.userId !== meId && m.role !== "OWNER" ? (
                      <div className={styles.memberActions}>
                        {m.role === "MEMBER" ? (
                          <form action={() => actions.changeRole(group.id, m.userId, "MANAGER")}>
                            <SubmitButton variant="secondary">{t("group.member.promote")}</SubmitButton>
                          </form>
                        ) : (
                          <form action={() => actions.changeRole(group.id, m.userId, "MEMBER")}>
                            <SubmitButton variant="secondary">{t("group.member.demote")}</SubmitButton>
                          </form>
                        )}
                        {isOwner ? (
                          <form action={() => actions.transferOwner(group.id, m.userId)}>
                            <SubmitButton variant="secondary">{t("group.member.transfer")}</SubmitButton>
                          </form>
                        ) : null}
                        <form action={() => actions.removeMember(group.id, m.userId)}>
                          <SubmitButton variant="danger">{t("group.member.remove")}</SubmitButton>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.rightStack}>
              <div className={styles.subSection}>
                <h4 className={styles.subTitle}>{t("invite.tabs.requests", { count: joinRequests.length })}</h4>
                <ul className={styles.simpleList}>
                  {joinRequests.map((r) => (
                    <li key={r.id} className={styles.simpleRow}>
                      <div className={styles.requestUser}>
                        <UserAvatar
                          nickname={r.nickname}
                          imageUrl={r.profileImageUrl}
                          size={28}
                          className={styles.avatar}
                        />
                        <strong>{r.nickname}</strong>
                        <span className={styles.rowMeta}>{new Date(r.createdAt).toLocaleString()}</span>
                      </div>
                      {canManage ? (
                        <div className={styles.memberActions}>
                          <form action={() => actions.decideJoin(group.id, r.id, "APPROVED")}>
                            <SubmitButton variant="primary">{t("invite.requests.approve")}</SubmitButton>
                          </form>
                          <form action={() => actions.decideJoin(group.id, r.id, "REJECTED")}>
                            <SubmitButton variant="secondary">{t("invite.requests.reject")}</SubmitButton>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {joinRequests.length === 0 ? <li className={styles.empty}>{t("invite.requests.empty")}</li> : null}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "settings" ? (
        <section id="settings" className={styles.sectionBlock}>
        <h3 className={styles.blockTitle}>{t("group.tabs.settings")}</h3>
        <div className={styles.settings}>
          {canManage ? (
            <form action={(fd) => actions.updateGroup(group.id, fd)} className={styles.settingsForm}>
                <div className={styles.basicJoinRow}>
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsTitle}>{t("group.settings.basicTitle")}</h3>
                    <div className={styles.basicSettingsGrid}>
                      <label className={styles.field} htmlFor="name">
                        <span className={styles.label}>
                          {t("groupNew.basic.name")} <span className={styles.req}>*</span>
                        </span>
                        <input id="name" name="name" defaultValue={group.name} maxLength={20} required className={styles.input} />
                      </label>
                      <label className={styles.field} htmlFor="maxMembers">
                        <span className={styles.label}>{t("groupNew.basic.maxMembers")}</span>
                        <input
                          id="maxMembers"
                          name="maxMembers"
                          type="number"
                          min={2}
                          max={50}
                          defaultValue={group.maxMembers}
                          className={styles.input}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.spanWide}`} htmlFor="description">
                        <span className={styles.label}>{t("groupNew.basic.description")}</span>
                        <textarea
                          id="description"
                          name="description"
                          defaultValue={group.description}
                          maxLength={4000}
                          rows={4}
                          className={styles.textarea}
                        />
                      </label>
                    </div>
                  </section>

                  <section className={`${styles.settingsSection} ${styles.joinSection}`}>
                    <h3 className={styles.settingsTitle}>{t("groupNew.join.title")}</h3>
                    <div className={styles.toggleStack}>
                      <Switch name="joinByCodeEnabled" defaultChecked={group.joinMethods.code} icon={<Icon name="key" size={16} />}>
                        {t("groupNew.join.code")}
                      </Switch>
                      <Switch name="joinByLinkEnabled" defaultChecked={group.joinMethods.link} icon={<Icon name="link" size={16} />}>
                        {t("groupNew.join.link")}
                      </Switch>
                      <Switch name="joinByRequestEnabled" defaultChecked={group.joinMethods.request} icon={<Icon name="userPlus" size={16} />}>
                        {t("groupNew.join.request")}
                      </Switch>
                      <Switch name="joinByEmailEnabled" defaultChecked={group.joinMethods.email} icon={<Icon name="mail" size={16} />}>
                        {t("groupNew.join.email")}
                      </Switch>
                    </div>
                  </section>
                </div>

                <section className={styles.settingsSection}>
                  <h3 className={styles.settingsTitle}>{t("groupNew.rules.title")}</h3>
                  <div className={styles.rulesGrid}>
                    <div className={styles.captioned}>
                      <Switch name="ruleUseDeadline" defaultChecked={group.rules.useDeadline}>
                        {t("groupNew.rules.useDeadline")}
                      </Switch>
                      <span className={`${styles.caption} ${styles.capOn}`}>
                        {t("groupNew.rules.deadlineOn")}
                      </span>
                      <span className={`${styles.caption} ${styles.capOff}`}>
                        {t("groupNew.rules.deadlineOff")}
                      </span>
                    </div>
                    <div className={`${styles.captioned} ${styles.deadlineDep}`}>
                      <input
                        id="ruleDefaultDeadlineTime"
                        name="ruleDefaultDeadlineTime"
                        type="time"
                        required
                        value={deadlineTime}
                        onChange={(e) => setDeadlineTime(e.target.value)}
                        className={styles.input}
                        aria-label={t("groupNew.rules.deadlineLabel")}
                      />
                      <span className={styles.caption}>
                        {t("groupNew.rules.deadlineCaption", { time: deadlineTime })}
                      </span>
                    </div>
                    <div className={`${styles.captioned} ${styles.deadlineDep}`}>
                      <Switch name="ruleAllowLateSubmission" defaultChecked={group.rules.allowLateSubmission}>
                        {t("groupNew.rules.allowLate")}
                      </Switch>
                      <span className={`${styles.caption} ${styles.lateOn}`}>
                        {t("groupNew.rules.lateOn")}
                      </span>
                      <span className={`${styles.caption} ${styles.lateOff}`}>
                        {t("groupNew.rules.lateOff")}
                      </span>
                    </div>
                    <Switch name="ruleUseAiFeedback" defaultChecked={group.rules.useAiFeedback}>
                      {t("groupNew.rules.ai")}
                    </Switch>
                    <div className={styles.captioned}>
                      <Switch name="ruleAllowEditAfterSubmit" defaultChecked={group.rules.allowEditAfterSubmit}>
                        {t("groupNew.rules.editAfter")}
                      </Switch>
                      <span className={`${styles.caption} ${styles.editOn}`}>
                        {t("groupNew.rules.editAfterOn")}
                      </span>
                      <span className={`${styles.caption} ${styles.editOff}`}>
                        {t("groupNew.rules.editAfterOff")}
                      </span>
                    </div>
                    <div
                      className={styles.captioned}
                      onChange={(e) => {
                        const target = e.target as HTMLInputElement;
                        if (target.name === "ruleAssignmentCreatorRoles" && target.checked) {
                          setCreatorRole(target.value);
                        }
                      }}
                    >
                      <SegmentedControl
                        name="ruleAssignmentCreatorRoles"
                        defaultValue={group.rules.assignmentCreatorRoles}
                        aria-label={t("group.settings.assignmentCreator")}
                        options={creatorRoleOptions}
                      />
                      <span className={styles.caption}>
                        {creatorRole === "OWNER_ONLY"
                          ? t("groupNew.rules.creator.captionOwnerOnly")
                          : t("groupNew.rules.creator.captionBoth")}
                      </span>
                    </div>
                  </div>
                </section>

                <section className={`${styles.settingsSection} ${styles.codeSection}`}>
                  {isOwner ? (
                    <div className={styles.codeSectionToolbar}>
                      <Button type="button" variant="danger" onClick={() => setCodeModalOpen(true)}>
                        {t("group.settings.regenerateCode")}
                      </Button>
                    </div>
                  ) : null}
                  <div className={styles.codeCards}>
                    <div className={`${styles.codeCardItem} ${styles.codeCardWithSideCopy}`}>
                      <div className={styles.codeCardMain}>
                        <h3 className={styles.settingsTitle}>{t("group.groupCode")}</h3>
                        <code className={styles.code}>{group.groupCode}</code>
                      </div>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        aria-label={
                          codeCopied ? t("group.copyDoneAria") : t("group.copyGroupCodeAria")
                        }
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(group.groupCode);
                            setCodeCopied(true);
                          } catch {
                            setCodeCopied(false);
                          }
                        }}
                      >
                        <Icon name={codeCopied ? "check" : "copy"} size={16} />
                      </button>
                    </div>

                    <div className={styles.codeCardItem}>
                      <div className={styles.codeCardMain}>
                        <h3 className={styles.settingsTitle}>{t("invite.links.cardHeading")}</h3>
                        {links.length > 0 ? (
                          <ul className={styles.inlineLinkList}>
                            {links.map((l) => (
                              <li key={l.id} className={styles.inlineLinkRow}>
                                <code className={styles.inlineLinkCode}>{l.url}</code>
                                <button
                                  type="button"
                                  className={styles.copyBtn}
                                  aria-label={
                                    copiedLinkId === l.id ? t("group.copyDoneAria") : t("group.copyInviteLinkAria")
                                  }
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(l.url);
                                      setCopiedLinkId(l.id);
                                    } catch {
                                      setCopiedLinkId(null);
                                    }
                                  }}
                                >
                                  <Icon name={copiedLinkId === l.id ? "check" : "copy"} size={16} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className={styles.memberHint}>{t("invite.links.empty")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <div className={styles.settingsActions}>
                  <SubmitButton variant="primary">{t("group.settings.save")}</SubmitButton>
                </div>
            </form>
          ) : null}

          <div className={styles.divider} />

          <div className={styles.bottomActions}>
            <Link href="/groups" className={styles.toolbarLinkMuted}>
              {t("group.links.list")}
            </Link>
            {!isOwner ? (
              <form action={() => actions.leaveGroup(group.id)}>
                <SubmitButton variant="secondary">{t("group.settings.leave")}</SubmitButton>
              </form>
            ) : (
              <Button type="button" variant="danger" onClick={() => setConfirmOpen(true)}>
                {t("group.settings.delete")}
              </Button>
            )}
          </div>
        </div>
      </section>
      ) : null}

      <Modal
        open={confirmOpen}
        title={t("group.deleteModal.title")}
        onClose={() => setConfirmOpen(false)}
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" type="button" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <form action={(fd) => actions.deleteGroup(group.id, fd)}>
              <input type="hidden" name="confirm" value={group.name} />
              <SubmitButton variant="danger">{t("group.deleteModal.confirm")}</SubmitButton>
            </form>
          </div>
        }
      >
        <p style={{ marginTop: 0 }}>{t("group.deleteModal.body", { name: group.name })}</p>
      </Modal>

      <Modal
        open={codeModalOpen}
        title={t("group.codeModal.title")}
        onClose={() => setCodeModalOpen(false)}
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" type="button" onClick={() => setCodeModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <form
              action={async () => {
                await actions.regenerateGroupCode(group.id);
                setCodeModalOpen(false);
              }}
            >
              <SubmitButton variant="danger">{t("group.codeModal.confirm")}</SubmitButton>
            </form>
          </div>
        }
      >
        <p className={styles.modalBody}>{t("group.codeModal.body")}</p>
      </Modal>
    </div>
  );
}
