# ERD (mermaid)

> `design/design.md` 확정 정책 기준의 1차 논리 ERD입니다.

```mermaid
erDiagram
    USERS {
      uuid id PK
      string provider "google|github|system"
      string provider_user_id
      string email
      string nickname
      string profile_image_url
      bool is_system_bot "AI 봇 등 시스템 사용자 표시"
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    GROUPS {
      uuid id PK
      string name
      text description
      uuid owner_user_id FK
      int max_members
      string group_code "8 chars, case-sensitive, unique"
      bool join_by_code_enabled
      bool join_by_link_enabled
      bool join_by_request_enabled
      bool join_by_email_enabled
      bool rule_use_deadline
      string rule_default_deadline_time "HH:MM KST"
      bool rule_allow_late_submission
      bool rule_use_ai_feedback
      string rule_translation_language "none|pseudo|python|java|cpp|javascript|typescript|c"
      bool rule_allow_edit_after_submit
      string rule_assignment_creator_roles "OWNER_ONLY|OWNER_AND_MANAGER"
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    GROUP_MEMBERS {
      uuid id PK
      uuid group_id FK
      uuid user_id FK
      string role "OWNER|MANAGER|MEMBER"
      datetime joined_at
      datetime left_at
    }

    GROUP_INVITE_LINKS {
      uuid id PK
      uuid group_id FK
      string token "URL-safe random token"
      datetime created_at
      datetime revoked_at "그룹 코드 변경 시 일괄 무효화"
    }

    GROUP_EMAIL_INVITES {
      uuid id PK
      uuid group_id FK
      uuid invited_by_user_id FK
      string email
      string token "1회용 토큰"
      datetime expires_at
      datetime accepted_at
      uuid accepted_user_id FK
      datetime created_at
    }

    JOIN_REQUESTS {
      uuid id PK
      uuid group_id FK
      uuid user_id FK
      string status "PENDING|APPROVED|REJECTED"
      uuid decided_by FK
      datetime decided_at
      datetime created_at
    }

    ASSIGNMENTS {
      uuid id PK
      uuid group_id FK
      string title
      string description_plain "과제 설명/힌트 plain (DB 컬럼명; 구 스키마 hint_plain은 마이그레이션으로 통합)"
      string problem_url
      string platform
      string difficulty
      datetime due_at
      bool allow_late_submission "그룹 규칙 default를 복사한 과제별 override"
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    PROBLEM_ANALYSES {
      uuid id PK
      uuid assignment_id FK
      string status
      json metadata
      datetime analyzed_at
      datetime created_at
    }

    ASSIGNMENT_COHORT_ANALYSES {
      uuid id PK
      uuid assignment_id FK UK "과제당 1행, 실패 시 재시도로 동일 행 갱신"
      string status "PENDING|RUNNING|DONE|FAILED"
      string target_language "실행 시작 시점의 그룹 rule_translation_language 스냅샷"
      string report_locale "리포트·역할 라벨 생성 로케일 (예: ko, en), 트리거 시 Accept-Language 기준"
      uuid triggered_by_user_id FK
      int token_used
      text report_markdown "status=DONE일 때 과제 단위 Markdown"
      jsonb artifacts "schemaVersion 2: 제출별 normalizedCode·regions(roleId, roleLabel, 줄 범위) 등 — 구버전은 pairwise diff 포함 가능"
      text failure_reason
      datetime started_at
      datetime finished_at
      datetime created_at
      datetime updated_at
    }

    ASSIGNMENT_COHORT_ANALYSIS_MEMBERS {
      uuid id PK
      uuid cohort_analysis_id FK
      uuid submission_id FK
      uuid submission_version_id FK "DONE 확정 시 포함된 버전 스냅샷"
    }

    SUBMISSIONS {
      uuid id PK
      uuid assignment_id FK
      uuid author_user_id FK
      string title
      string language
      string latest_code
      text note_markdown "제출 단위 메모(Markdown), 버전관리 없음"
      bool is_late
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    SUBMISSION_VERSIONS {
      uuid id PK
      uuid submission_id FK
      int version_no
      string language
      string code
      datetime created_at
    }

    SUBMISSION_DIFFS {
      uuid id PK
      uuid submission_id FK
      int from_version
      int to_version
      text diff_text
      datetime created_at
    }

    SUBMISSION_TRANSLATIONS {
      uuid id PK
      uuid submission_id FK
      uuid submission_version_id FK
      string source_language
      string target_language
      text translated_code
      uuid requested_by_user_id FK
      int token_used
      bool is_copy "원본 == 대상 언어인 경우 true"
      datetime created_at
    }

    AI_REVIEW_RUNS {
      uuid id PK
      uuid submission_id FK
      uuid submission_version_id FK
      string status "PENDING|RUNNING|DONE|FAILED"
      string failure_reason
      int token_used
      datetime started_at
      datetime finished_at
      datetime created_at
    }

    COMMENTS {
      uuid id PK
      uuid group_id FK
      uuid assignment_id FK
      uuid submission_id FK
      uuid parent_comment_id FK
      uuid author_user_id FK
      bool is_ai_bot "AI_REVIEW_RUNS 결과로 만들어진 댓글"
      uuid ai_review_run_id FK
      string body
      bool is_admin_hidden
      bool is_deleted
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    REVIEWS {
      uuid id PK
      uuid group_id FK
      uuid assignment_id FK
      uuid submission_id FK
      uuid submission_version_id FK
      uuid author_user_id FK
      bool is_ai_bot
      uuid ai_review_run_id FK
      string review_type "LINE|RANGE|FILE|SUBMISSION"
      string file_path
      int start_line
      int end_line
      string body
      bool is_deleted
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    REVIEW_REPLIES {
      uuid id PK
      uuid review_id FK
      uuid parent_reply_id FK
      uuid author_user_id FK
      bool is_ai_bot
      uuid ai_review_run_id FK
      string body
      bool is_admin_hidden
      bool is_deleted
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    REACTIONS {
      uuid id PK
      string target_type "review|review_reply|comment|post_comment"
      uuid target_id
      uuid user_id FK
      string emoji "유니코드 이모지 문자열"
      datetime created_at
    }

    NOTIFICATIONS {
      uuid id PK
      uuid recipient_user_id FK
      string type
      json payload
      bool is_read
      datetime read_at
      datetime created_at
      datetime deleted_at
    }

    CALENDAR_EVENTS {
      uuid id PK
      uuid group_id FK
      uuid assignment_id FK
      date event_date
      string status
      datetime created_at
      datetime updated_at
    }

    ANNOUNCEMENTS {
      uuid id PK
      uuid group_id FK
      uuid author_user_id FK
      string title
      text body_markdown
      bool is_pinned
      bool is_important
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    COMMUNITY_POSTS {
      uuid id PK
      uuid group_id FK
      uuid author_user_id FK
      string category
      string title
      text body_markdown
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    POST_COMMENTS {
      uuid id PK
      uuid group_id FK
      uuid announcement_id FK
      uuid community_post_id FK
      uuid parent_comment_id FK
      uuid author_user_id FK
      string body
      bool is_deleted
      datetime created_at
      datetime updated_at
      datetime deleted_at
    }

    AI_TOKEN_BALANCES {
      uuid id PK
      uuid user_id FK
      int balance_tokens
      datetime updated_at
    }

    USERS ||--o{ GROUP_MEMBERS : has
    GROUPS ||--o{ GROUP_MEMBERS : has
    GROUPS ||--o{ GROUP_INVITE_LINKS : has
    GROUPS ||--o{ GROUP_EMAIL_INVITES : has
    GROUPS ||--o{ JOIN_REQUESTS : has
    USERS ||--o{ JOIN_REQUESTS : requests
    USERS ||--o{ GROUP_EMAIL_INVITES : invites
    USERS ||--o{ GROUP_EMAIL_INVITES : accepts

    GROUPS ||--o{ ASSIGNMENTS : has
    ASSIGNMENTS ||--o| PROBLEM_ANALYSES : has
    ASSIGNMENTS ||--o| ASSIGNMENT_COHORT_ANALYSES : has

    ASSIGNMENTS ||--o{ SUBMISSIONS : has
    USERS ||--o{ SUBMISSIONS : writes
    SUBMISSIONS ||--o{ SUBMISSION_VERSIONS : versions
    SUBMISSIONS ||--o{ SUBMISSION_DIFFS : diffs
    SUBMISSION_VERSIONS ||--o{ SUBMISSION_TRANSLATIONS : cached
    USERS ||--o{ SUBMISSION_TRANSLATIONS : requested

    ASSIGNMENT_COHORT_ANALYSES ||--o{ ASSIGNMENT_COHORT_ANALYSIS_MEMBERS : includes
    SUBMISSIONS ||--o{ ASSIGNMENT_COHORT_ANALYSIS_MEMBERS : cohort_snapshot
    SUBMISSION_VERSIONS ||--o{ ASSIGNMENT_COHORT_ANALYSIS_MEMBERS : cohort_version
    USERS ||--o{ ASSIGNMENT_COHORT_ANALYSES : triggers_cohort

    SUBMISSIONS ||--o{ AI_REVIEW_RUNS : analyzed
    SUBMISSION_VERSIONS ||--o{ AI_REVIEW_RUNS : scoped_to
    AI_REVIEW_RUNS ||--o{ COMMENTS : produces
    AI_REVIEW_RUNS ||--o{ REVIEWS : produces
    AI_REVIEW_RUNS ||--o{ REVIEW_REPLIES : produces

    ASSIGNMENTS ||--o{ COMMENTS : has
    SUBMISSIONS ||--o{ COMMENTS : has
    USERS ||--o{ COMMENTS : writes
    COMMENTS ||--o{ COMMENTS : replies

    ASSIGNMENTS ||--o{ REVIEWS : has
    SUBMISSIONS ||--o{ REVIEWS : has
    SUBMISSION_VERSIONS ||--o{ REVIEWS : scoped_to
    USERS ||--o{ REVIEWS : writes
    REVIEWS ||--o{ REVIEW_REPLIES : has
    USERS ||--o{ REVIEW_REPLIES : writes

    USERS ||--o{ REACTIONS : adds

    USERS ||--o{ NOTIFICATIONS : receives
    GROUPS ||--o{ CALENDAR_EVENTS : has
    ASSIGNMENTS ||--o{ CALENDAR_EVENTS : maps_to

    GROUPS ||--o{ ANNOUNCEMENTS : has
    GROUPS ||--o{ COMMUNITY_POSTS : has
    USERS ||--o{ ANNOUNCEMENTS : writes
    USERS ||--o{ COMMUNITY_POSTS : writes
    ANNOUNCEMENTS ||--o{ POST_COMMENTS : has
    COMMUNITY_POSTS ||--o{ POST_COMMENTS : has
    USERS ||--o{ POST_COMMENTS : writes

    USERS ||--|| AI_TOKEN_BALANCES : owns
```

## ERD 메모

- `USERS`는 provider별 계정을 별도 사용자로 저장합니다. AI 봇은 `provider = 'system'` + `is_system_bot = true`인 단일 시스템 사용자로 관리합니다.
- `GROUPS`는 그룹명·설명·최대 인원수·그룹 코드·가입 방식 토글 4개·그룹 규칙 7개를 자체 컬럼으로 가집니다. 별도의 `group_feedback_policies`, `assignment_policy_overrides` 테이블은 두지 않습니다.
- 그룹 코드(`group_code`)는 unique 제약을 가지며 `COLLATE "C"`로 대소문자를 구분합니다.
- `GROUP_INVITE_LINKS`는 그룹의 영구 코드를 신뢰 토큰으로 사용하는 공유 링크를 표현합니다. 만료 시각이나 최대 사용 횟수를 가지지 않습니다. 그룹 코드 갱신 시 모든 행의 `revoked_at`이 채워져 무효화됩니다.
- `GROUP_EMAIL_INVITES`는 1회용 이메일 초대를 표현합니다. `expires_at` 7일 default, `accepted_at`이 채워지면 만료된 것으로 간주합니다.
- `SUBMISSION_TRANSLATIONS`는 제출 버전 단위 번역 캐시입니다. `is_copy = true`이면 토큰 미차감 사본입니다. 같은 `(submission_version_id, target_language)` 쌍은 캐시 키로 unique입니다.
- `AI_REVIEW_RUNS`는 AI 코드 리뷰 시도를 표현하며, 한 번의 run이 여러 댓글·리뷰·답글을 생성합니다. 결과 댓글·리뷰는 `is_ai_bot = true`로 마킹되고 `ai_review_run_id`로 추적됩니다.
- 과제 삭제는 실삭제이며, 과제에 묶인 제출, 제출 버전, diff, 번역 캐시, AI run, **집단 코드 비교 분석**(`ASSIGNMENT_COHORT_ANALYSES` 및 `ASSIGNMENT_COHORT_ANALYSIS_MEMBERS`), 댓글, 리뷰, 답글이 함께 삭제됩니다.
- `ASSIGNMENT_COHORT_ANALYSES`는 과제당 최대 1행입니다. 실패 후 재시도는 동일 행을 갱신하는 방식으로 모델링할 수 있습니다. `DONE` 이후에는 같은 과제에서 재실행하지 않습니다.
- `ASSIGNMENT_COHORT_ANALYSIS_MEMBERS`는 성공 확정 시점에 포함된 `(submission_id, submission_version_id)`를 기록해, 이후 추가된 제출·버전과 구분합니다.
- `assignments.description_plain` 컬럼은 과제 설명·힌트 plain 텍스트입니다. 초기 스키마는 `hint_plain`이었고 마이그레이션으로 엔티티명과 맞춥니다.
- 그룹 삭제 시 위 항목 + 공지/커뮤니티/캘린더가 함께 삭제됩니다. 알림은 보존합니다.
- 코드 리뷰는 `submission_version_id`에 귀속해 버전 간 라인 매핑을 하지 않습니다.
- 피드백 공개 정책은 `그룹원 모두 공개` 단일 모델이므로 별도 정책 테이블이 필요 없습니다.
- `REACTIONS`는 댓글류 도메인을 polymorphic으로 묶는 단일 테이블입니다. `target_type` 값은 `review`, `review_reply`, `comment`, `post_comment` 네 가지이며 같은 사용자가 같은 대상에 같은 이모지를 두 번 달지 못하도록 `(target_type, target_id, user_id, emoji)` unique 제약을 둡니다. 대상 댓글이 삭제될 때 함께 삭제됩니다(FK가 아닌 polymorphic이므로 애플리케이션 레벨 cascade).
