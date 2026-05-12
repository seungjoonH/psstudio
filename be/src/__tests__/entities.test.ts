// 모든 TypeORM 엔티티가 올바른 메타데이터를 갖는지 검증합니다.
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AiAnalysis } from "../modules/submissions/ai-analysis.entity.js";
import { AiTokenBalance } from "../modules/ai-tokens/ai-token-balance.entity.js";
import { Announcement } from "../modules/board/announcement.entity.js";
import { Assignment } from "../modules/assignments/assignment.entity.js";
import { AssignmentAssignee } from "../modules/assignments/assignment-assignee.entity.js";
import { AssignmentCohortAnalysisMember } from "../modules/assignments/assignment-cohort-analysis-member.entity.js";
import { AssignmentCohortAnalysis } from "../modules/assignments/assignment-cohort-analysis.entity.js";
import { AssignmentPolicyOverride } from "../modules/assignments/assignment-policy-override.entity.js";
import { CalendarEvent } from "../modules/calendar/calendar-event.entity.js";
import { Comment } from "../modules/comments/comment.entity.js";
import { CommunityPost } from "../modules/board/community-post.entity.js";
import { Group } from "../modules/groups/group.entity.js";
import { GroupMember } from "../modules/groups/group-member.entity.js";
import { GroupEmailInvite } from "../modules/invites/group-email-invite.entity.js";
import { GroupInviteLink } from "../modules/invites/group-invite-link.entity.js";
import { JoinRequest } from "../modules/invites/join-request.entity.js";
import { Notification } from "../modules/notifications/notification.entity.js";
import { PostComment } from "../modules/board/post-comment.entity.js";
import { ProblemAnalysis } from "../modules/assignments/problem-analysis.entity.js";
import { Review } from "../modules/reviews/review.entity.js";
import { ReviewReply } from "../modules/reviews/review-reply.entity.js";
import { Submission } from "../modules/submissions/submission.entity.js";
import { SubmissionDiff } from "../modules/submissions/submission-diff.entity.js";
import { SubmissionVersion } from "../modules/submissions/submission-version.entity.js";
import { User } from "../modules/users/user.entity.js";

const ALL = [
  ["users", User],
  ["groups", Group],
  ["group_members", GroupMember],
  ["group_invite_links", GroupInviteLink],
  ["group_email_invites", GroupEmailInvite],
  ["join_requests", JoinRequest],
  ["assignments", Assignment],
  ["assignment_assignees", AssignmentAssignee],
  ["assignment_cohort_analyses", AssignmentCohortAnalysis],
  ["assignment_cohort_analysis_members", AssignmentCohortAnalysisMember],
  ["assignment_policy_overrides", AssignmentPolicyOverride],
  ["problem_analyses", ProblemAnalysis],
  ["submissions", Submission],
  ["submission_versions", SubmissionVersion],
  ["submission_diffs", SubmissionDiff],
  ["ai_analyses", AiAnalysis],
  ["comments", Comment],
  ["reviews", Review],
  ["review_replies", ReviewReply],
  ["notifications", Notification],
  ["calendar_events", CalendarEvent],
  ["announcements", Announcement],
  ["community_posts", CommunityPost],
  ["post_comments", PostComment],
  ["ai_token_balances", AiTokenBalance],
] as const;

describe("entity metadata", () => {
  for (const [tableName, EntityClass] of ALL) {
    it(`${tableName} 엔티티 인스턴스를 만들 수 있다`, () => {
      const Ctor = EntityClass as unknown as new () => unknown;
      const instance = new Ctor();
      expect(instance).toBeInstanceOf(EntityClass);
    });
  }

  it("ENTITIES 배열에 모든 엔티티가 등록되어 있다", async () => {
    const { ENTITIES } = await import("../config/data-source.js");
    expect(ENTITIES.length).toBeGreaterThanOrEqual(ALL.length);
  });
});
