"use client";

// 제출 상세에서 제목 변경/코드 수정/삭제를 다루는 컴포넌트입니다.
import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ReactionTargetType,
  SubmissionCommentDto,
  SubmissionDetailDto,
  SubmissionReviewDto,
} from "../../../../../../../src/submissions/server";
import { MAX_SUBMISSION_CODE_BYTES } from "@psstudio/shared";
import { formatKstDateTime } from "../../../../../../../src/i18n/formatDateTime";
import { useI18n } from "../../../../../../../src/i18n/I18nProvider";
import { Badge } from "../../../../../../../src/ui/Badge";
import { Button } from "../../../../../../../src/ui/Button";
import { Icon } from "../../../../../../../src/ui/Icon";
import { SubmitButton } from "../../../../../../../src/ui/SubmitButton";
import { SubmissionCodeEditor } from "../../../../../../../src/ui/SubmissionCodeEditor";
import { Modal } from "../../../../../../../src/ui/Modal";
import { MarkdownPreview } from "../../../../../../../src/ui/MarkdownPreview";
import { CommentCard } from "../../../../../../../src/ui/comments/CommentCard";
import { DiffViewerClient } from "./diff/DiffViewerClient";
import styles from "./SubmissionDetailClient.module.css";

type Actions = {
  updateCode: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  deleteSubmission: () => Promise<void>;
  createComment: (formData: FormData) => Promise<void>;
  createCommentReply: (parentCommentId: string, body: string) => Promise<void>;
  requestAiReview: () => Promise<void>;
  updateNote: (formData: FormData) => Promise<void>;
  toggleCommentReaction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
  createReview: (formData: FormData) => Promise<void>;
  createReviewReply: (reviewId: string, body: string) => Promise<void>;
  toggleReviewReaction: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => Promise<void>;
};

type Props = {
  groupId: string;
  assignmentId: string;
  submission: SubmissionDetailDto;
  comments: SubmissionCommentDto[];
  reviews: SubmissionReviewDto[];
  canEdit: boolean;
  canDelete: boolean;
  canRequestAiFeedback: boolean;
  actions: Actions;
};

export function SubmissionDetailClient({
  groupId,
  assignmentId,
  submission,
  comments,
  reviews,
  canEdit,
  canDelete,
  canRequestAiFeedback,
  actions,
}: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(submission.title);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState(submission.latestCode);
  const [lastSavedDraft, setLastSavedDraft] = useState(submission.latestCode);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentTab, setCommentTab] = useState<"write" | "preview">("write");
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(submission.noteMarkdown);
  const [requestingAiFeedback, setRequestingAiFeedback] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };
  const handleToggleCommentReaction = async (
    commentId: string,
    emoji: string,
    reactedByMe: boolean,
  ) => {
    await actions.toggleCommentReaction("comment", commentId, emoji, reactedByMe);
    refresh();
  };
  const handleSubmitReply = async (commentId: string, body: string) => {
    await actions.createCommentReply(commentId, body);
    refresh();
  };
  const byteLen = new Blob([draft]).size;
  const hasCodeChanges = draft !== lastSavedDraft;

  async function handleSaveNewVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasCodeChanges || byteLen > MAX_SUBMISSION_CODE_BYTES) return;
    const formData = new FormData(event.currentTarget);
    try {
      await actions.updateCode(formData);
    } catch {
      return;
    }
    setLastSavedDraft(draft);
    setEditing(false);
    refresh();
  }
  const sortedVersions = [...submission.versions].sort((a, b) => b.versionNo - a.versionNo);
  const latestVersion = sortedVersions[0];
  const pastVersions = sortedVersions.slice(1);
  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const handleRename = async (formData: FormData) => {
    await actions.rename(formData);
    setTitleEditing(false);
  };

  return (
    <div className={styles.root}>
      <section className={styles.heroCard}>
        <div className={styles.heroTop}>
          {titleEditing && canEdit ? (
            <form action={handleRename} className={styles.titleEditForm}>
              <input type="hidden" name="title" value={titleDraft} />
              <input
                value={titleDraft}
                maxLength={100}
                className={styles.titleInput}
                onChange={(event) => setTitleDraft(event.target.value)}
              />
              <button
                type="submit"
                className={styles.iconBtn}
                aria-label={t("submission.detail.titleSave")}
                title={t("submission.detail.titleSave")}
                disabled={titleDraft.trim().length === 0}
              >
                <Icon name="save" size={18} />
              </button>
            </form>
          ) : (
            <div className={styles.titleRow}>
              <h2 className={styles.heroTitle}>{submission.title}</h2>
              {canEdit ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t("submission.detail.titleEdit")}
                  title={t("submission.detail.titleEdit")}
                  onClick={() => setTitleEditing(true)}
                >
                  <Icon name="edit" size={18} />
                </button>
              ) : null}
            </div>
          )}
          <div className={styles.heroActions}>
            {canRequestAiFeedback ? (
              <Button
                type="button"
                variant="secondary"
                leftIcon={<Icon name="sparkles" size={14} className={styles.aiButtonIcon} aria-hidden />}
                onClick={async () => {
                  if (requestingAiFeedback) return;
                  setRequestingAiFeedback(true);
                  try {
                    await actions.requestAiReview();
                    refresh();
                  } finally {
                    setRequestingAiFeedback(false);
                  }
                }}
                disabled={requestingAiFeedback || submission.currentVersionHasAiFeedback}
                title={
                  submission.currentVersionHasAiFeedback
                    ? t("submission.detail.aiFeedbackAlreadyUsed")
                    : undefined
                }
              >
                {requestingAiFeedback
                  ? t("submission.detail.aiFeedbackRequesting")
                  : t("submission.detail.aiFeedback")}
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing((prev) => {
                    const next = !prev;
                    if (next) {
                      setDraft(submission.latestCode);
                      setLastSavedDraft(submission.latestCode);
                    }
                    return next;
                  });
                }}
              >
                {editing ? t("submission.detail.cancelEdit") : t("submission.detail.codeEdit")}
              </Button>
            ) : null}
            {canDelete ? (
              <Button type="button" variant="danger" onClick={() => setConfirmOpen(true)}>
                {t("submission.detail.delete")}
              </Button>
            ) : null}
          </div>
        </div>
        <div className={styles.heroMeta}>
          <Badge tone="neutral">{submission.language}</Badge>
          <Badge tone="neutral">v{submission.currentVersionNo}</Badge>
          {submission.isLate ? <Badge tone="warning">{t("submission.detail.late")}</Badge> : null}
        </div>
        <p className={styles.heroDate}>{formatKstDateTime(submission.createdAt, locale)}</p>
      </section>

      {editing ? (
        <form onSubmit={handleSaveNewVersion} className={styles.editForm}>
          <input type="hidden" name="language" value={submission.language} />
          <p className={styles.note}>
            {t("submission.detail.langNote", { lang: submission.language })}
          </p>
          <input type="hidden" name="code" value={draft} />
          <SubmissionCodeEditor value={draft} onChange={setDraft} language={submission.language} />
          <p className={styles.byteLine}>
            {t("submission.detail.byteCount", {
              cur: byteLen.toLocaleString(),
              max: MAX_SUBMISSION_CODE_BYTES.toLocaleString(),
            })}
          </p>
          <div>
            <SubmitButton
              variant="primary"
              disabled={byteLen > MAX_SUBMISSION_CODE_BYTES || !hasCodeChanges}
            >
              {t("submission.detail.saveVersion")}
            </SubmitButton>
          </div>
        </form>
      ) : (
        <DiffViewerClient
          groupId={groupId}
          assignmentId={assignmentId}
          submissionId={submission.id}
          versions={submission.versions.map((version) => version.versionNo)}
          fromVersion={submission.currentVersionNo}
          toVersion={submission.currentVersionNo}
          diffText=""
          reviews={reviews}
          sameVersionCode={submission.latestCode}
          sameVersionLanguage={submission.language}
          showRangeSelector={false}
          collapseReviewsByDefault={true}
          createReviewAction={actions.createReview}
          createReplyAction={actions.createReviewReply}
          toggleReactionAction={actions.toggleReviewReaction}
        />
      )}

      {latestVersion !== undefined ? (
        <section className={styles.versionSection}>
          <ul className={styles.versionList}>
            <li className={styles.versionRow}>
              <Link
                href={`/groups/${groupId}/assignments/${assignmentId}/submissions/${submission.id}/diff?from=${Math.max(0, latestVersion.versionNo - 1)}&to=${latestVersion.versionNo}`}
              >
                <strong>v{latestVersion.versionNo}</strong>
              </Link>
              <span className={styles.note}>{latestVersion.language}</span>
              <span className={styles.note}>{new Date(latestVersion.createdAt).toLocaleString()}</span>
            </li>
          </ul>
          {pastVersions.length > 0 ? (
            <div className={styles.versionHistoryWrap}>
              <button
                type="button"
                className={styles.historyToggleBtn}
                onClick={() => setVersionHistoryOpen((open) => !open)}
              >
                {versionHistoryOpen
                  ? t("submission.detail.versionHistoryHide")
                  : t("submission.detail.versionHistoryShow")}
              </button>
              {versionHistoryOpen ? (
                <ul className={styles.versionHistoryList}>
                  {pastVersions.map((version) => (
                    <li key={version.versionNo} className={styles.versionRow}>
                      <Link
                        href={`/groups/${groupId}/assignments/${assignmentId}/submissions/${submission.id}/diff?from=${Math.max(0, version.versionNo - 1)}&to=${version.versionNo}`}
                      >
                        <strong>v{version.versionNo}</strong>
                      </Link>
                      <span className={styles.note}>{version.language}</span>
                      <span className={styles.note}>
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.noteSection}>
        <div className={styles.noteHead}>
          <h3 className={styles.noteTitle}>{t("submission.detail.noteTitle")}</h3>
          {canEdit ? (
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={t("submission.detail.noteEdit")}
              title={t("submission.detail.noteEdit")}
              onClick={() => setNoteEditing((prev) => !prev)}
            >
              <Icon name="edit" size={16} />
            </button>
          ) : null}
        </div>
        {noteEditing && canEdit ? (
          <form
            action={async (formData) => {
              await actions.updateNote(formData);
              setNoteEditing(false);
            }}
            className={styles.noteForm}
          >
            <input type="hidden" name="noteMarkdown" value={noteDraft} />
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={t("submission.detail.notePlaceholder")}
              className={styles.noteTextarea}
            />
            <div className={styles.noteActions}>
              <Button type="button" variant="secondary" onClick={() => setNoteEditing(false)}>
                {t("common.cancel")}
              </Button>
              <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
            </div>
          </form>
        ) : submission.noteMarkdown.trim().length > 0 ? (
          <div className={styles.notePreview}>
            <MarkdownPreview content={submission.noteMarkdown} />
          </div>
        ) : (
          <p className={styles.note}>{t("submission.detail.noteEmpty")}</p>
        )}
      </section>

      <section className={styles.commentSection}>
        <h3 className={styles.commentTitle}>{t("submission.detail.commentsTitle")}</h3>
        {sortedComments.length === 0 ? (
          <p className={styles.note}>{t("submission.detail.commentEmpty")}</p>
        ) : (
          <ul className={styles.commentList}>
            {sortedComments.map((comment) => (
              <li key={comment.id} className={styles.commentItem}>
                <CommentCard
                  authorNickname={comment.authorNickname}
                  authorProfileImageUrl={comment.authorProfileImageUrl}
                  createdAt={comment.createdAt}
                  body={comment.body}
                  headerAction={
                    comment.submissionVersionNo !== null ? (
                      <Link
                        href={`/groups/${groupId}/assignments/${assignmentId}/submissions/${submission.id}/diff?from=${Math.max(0, comment.submissionVersionNo - 1)}&to=${comment.submissionVersionNo}`}
                      >
                        {`v${comment.submissionVersionNo}`}
                      </Link>
                    ) : null
                  }
                  reactions={comment.reactions}
                  onToggleReaction={(emoji, reactedByMe) =>
                    handleToggleCommentReaction(comment.id, emoji, reactedByMe)
                  }
                  replies={comment.replies.map((reply) => ({
                    id: reply.id,
                    authorNickname: reply.authorNickname,
                    authorProfileImageUrl: reply.authorProfileImageUrl,
                    body: reply.body,
                    createdAt: reply.createdAt,
                    reactions: reply.reactions,
                  }))}
                  onSubmitReply={(body) => handleSubmitReply(comment.id, body)}
                  onToggleReplyReaction={(replyId, emoji, reactedByMe) =>
                    handleToggleCommentReaction(replyId, emoji, reactedByMe)
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <div className={styles.commentActionRow}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCommentComposerOpen((open) => !open)}
          >
            {commentComposerOpen ? t("submission.detail.commentClose") : t("submission.detail.commentOpen")}
          </Button>
        </div>
        {commentComposerOpen ? (
          <form action={actions.createComment} className={styles.commentForm}>
            <input type="hidden" name="body" value={commentDraft} />
            <div className={styles.commentBox}>
              <div className={styles.commentTabs}>
                <button
                  type="button"
                  className={commentTab === "write" ? styles.commentTabActive : styles.commentTab}
                  onClick={() => setCommentTab("write")}
                >
                  {t("submission.diff.write")}
                </button>
                <button
                  type="button"
                  className={commentTab === "preview" ? styles.commentTabActive : styles.commentTab}
                  onClick={() => setCommentTab("preview")}
                >
                  {t("submission.diff.preview")}
                </button>
              </div>
              {commentTab === "write" ? (
                <textarea
                  required
                  rows={6}
                  className={styles.textarea}
                  placeholder={t("submission.detail.commentPlaceholder")}
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
              ) : (
                <div className={styles.previewArea}>
                  {commentDraft.trim().length > 0 ? (
                    <MarkdownPreview content={commentDraft} />
                  ) : (
                    t("submission.diff.previewEmpty")
                  )}
                </div>
              )}
            </div>
            <div className={styles.commentSubmitRow}>
              <SubmitButton variant="secondary" disabled={commentDraft.trim().length === 0}>
                {t("submission.detail.commentSubmit")}
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </section>

      <Modal
        open={confirmOpen}
        title={t("submission.detail.deleteTitle")}
        onClose={() => setConfirmOpen(false)}
        footer={
          <div className={styles.modalFooter}>
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("submission.detail.deleteCancel")}
            </Button>
            <form action={actions.deleteSubmission}>
              <SubmitButton variant="danger">
                {t("submission.detail.deleteConfirm")}
              </SubmitButton>
            </form>
          </div>
        }
      >
        <p style={{ margin: 0 }}>{t("submission.detail.deleteBody")}</p>
      </Modal>
    </div>
  );
}
