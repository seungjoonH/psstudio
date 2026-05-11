// TypeORM DataSource 단일 인스턴스를 관리하는 진입점입니다.
import { DataSource } from "typeorm";
import { Init1700000000000 } from "../../migrations/1700000000000-init.js";
import { GroupModelV21741000000000 } from "../../migrations/1741000000000-group-model-v2.js";
import { AssignmentHintAlgorithmsRename1765000000000 } from "../../migrations/1765000000000-assignment-hint-algorithms-rename.js";
import { ReactionsAndReplies1780000000000 } from "../../migrations/1780000000000-reactions-and-replies.js";
import { AssignmentsHintPlainToDescriptionPlain1781000000000 } from "../../migrations/1781000000000-assignments-hint-plain-to-description-plain.js";
import { SubmissionsNoteMarkdown1782000000000 } from "../../migrations/1782000000000-submissions-note-markdown.js";
import { CommentsSubmissionVersionNo1783000000000 } from "../../migrations/1783000000000-comments-submission-version-no.js";
import { AssignmentCohortAnalyses1784000000000 } from "../../migrations/1784000000000-assignment-cohort-analyses.js";
import { AssignmentCohortReportLocale1785000000000 } from "../../migrations/1785000000000-assignment-cohort-report-locale.js";
import { ClearAssignmentCohortAnalyses1786000000000 } from "../../migrations/1786000000000-clear-assignment-cohort-analyses.js";
import { ClearAssignmentCohortAnalysesData1787000000000 } from "../../migrations/1787000000000-clear-assignment-cohort-analyses-data.js";
import { RemoveTranslationCohortTargetLang1788000000000 } from "../../migrations/1788000000000-remove-translation-cohort-target-lang.js";
import { ENV } from "./env.js";
import { AiTokenBalance } from "../modules/ai-tokens/ai-token-balance.entity.js";
import { Announcement } from "../modules/board/announcement.entity.js";
import { CommunityPost } from "../modules/board/community-post.entity.js";
import { PostComment } from "../modules/board/post-comment.entity.js";
import { CalendarEvent } from "../modules/calendar/calendar-event.entity.js";
import { Comment } from "../modules/comments/comment.entity.js";
import { AiAnalysis } from "../modules/submissions/ai-analysis.entity.js";
import { Submission } from "../modules/submissions/submission.entity.js";
import { SubmissionDiff } from "../modules/submissions/submission-diff.entity.js";
import { SubmissionVersion } from "../modules/submissions/submission-version.entity.js";
import { Assignment } from "../modules/assignments/assignment.entity.js";
import { AssignmentCohortAnalysisMember } from "../modules/assignments/assignment-cohort-analysis-member.entity.js";
import { AssignmentCohortAnalysis } from "../modules/assignments/assignment-cohort-analysis.entity.js";
import { AssignmentPolicyOverride } from "../modules/assignments/assignment-policy-override.entity.js";
import { ProblemAnalysis } from "../modules/assignments/problem-analysis.entity.js";
import { GroupEmailInvite } from "../modules/invites/group-email-invite.entity.js";
import { GroupInviteLink } from "../modules/invites/group-invite-link.entity.js";
import { JoinRequest } from "../modules/invites/join-request.entity.js";
import { Group } from "../modules/groups/group.entity.js";
import { GroupMember } from "../modules/groups/group-member.entity.js";
import { Notification } from "../modules/notifications/notification.entity.js";
import { Reaction } from "../modules/reactions/reaction.entity.js";
import { Review } from "../modules/reviews/review.entity.js";
import { ReviewReply } from "../modules/reviews/review-reply.entity.js";
import { User } from "../modules/users/user.entity.js";

export const ENTITIES = [
  User,
  Group,
  GroupMember,
  GroupInviteLink,
  GroupEmailInvite,
  JoinRequest,
  Assignment,
  AssignmentCohortAnalysis,
  AssignmentCohortAnalysisMember,
  AssignmentPolicyOverride,
  ProblemAnalysis,
  Submission,
  SubmissionVersion,
  SubmissionDiff,
  AiAnalysis,
  Comment,
  Review,
  ReviewReply,
  Reaction,
  Notification,
  CalendarEvent,
  Announcement,
  CommunityPost,
  PostComment,
  AiTokenBalance,
];

export const MIGRATIONS = [
  Init1700000000000,
  GroupModelV21741000000000,
  AssignmentHintAlgorithmsRename1765000000000,
  ReactionsAndReplies1780000000000,
  AssignmentsHintPlainToDescriptionPlain1781000000000,
  SubmissionsNoteMarkdown1782000000000,
  CommentsSubmissionVersionNo1783000000000,
  AssignmentCohortAnalyses1784000000000,
  AssignmentCohortReportLocale1785000000000,
  ClearAssignmentCohortAnalyses1786000000000,
  ClearAssignmentCohortAnalysesData1787000000000,
  RemoveTranslationCohortTargetLang1788000000000,
];

export const dataSource = new DataSource({
  type: "postgres",
  url: ENV.databaseUrl(),
  entities: ENTITIES,
  migrations: MIGRATIONS,
  migrationsTableName: "migrations",
  synchronize: false,
  logging: false,
});

export default dataSource;
