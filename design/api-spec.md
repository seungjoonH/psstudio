# API Spec

> `design/design.md`의 확정 정책을 기준으로 작성한 1차 API 명세입니다.

## 1. 공통 규약

- Base URL: `/api/v1`
- Content-Type: `application/json`
- 시간 포맷: ISO 8601 UTC 저장, 클라이언트 표시 시 KST 변환
- 인증 방식: OAuth 로그인 세션 기반 인증(google, github)
- 비인증 접근은 로그인/공개 페이지 외 `401 Unauthorized`
- 서버 환경변수 최소 스키마: `BE_PORT`, `BE_PUBLIC_BASE_URL`, `FE_PUBLIC_BASE_URL`, `DATABASE_URL`, `REDIS_URL`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`, OAuth client id/secret/redirect URI, `LLM_PROVIDER`(`openrouter|requesty`), `OPEN_ROUTER_API_KEY`, `REQUESTY_API_KEY`, `REQUESTY_BASE_URL`, LLM 모델명(`LLM_MODEL_PROBLEM_ANALYZE`, `LLM_MODEL_SUBMISSION_REVIEW`, 집단 분석용 모델 키 등, OpenRouter 기준 예: `openai/gpt-4o-mini`), `AI_TOKEN_DEFAULT`, 이메일(`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`)
- Docker Compose 로컬 기본 서비스: `fe`, `be`, `worker`, `supabase`, `redis`
- API 문서: `GET /api-docs`
- OpenAPI JSON: `GET /api-docs/json`
- 로컬 환경변수 파일은 워크스페이스별로 분리합니다(`be/.env.local`, `fe/.env.local`, `worker/.env.local`). 각 파일은 해당 앱이 직접 읽는 키만 둡니다.
- 환경변수 fallback 금지: 필수 환경변수가 없으면 즉시 에러 처리

### 1.0 API 문서 제공 방식

- 로컬 BE 기본 주소 기준 Swagger UI는 `http://localhost:4000/api-docs`에서 확인합니다.
- OpenAPI 원본 JSON은 `http://localhost:4000/api-docs/json`에서 확인합니다.
- 현재 로컬 환경에 패키지 매니저가 없어 `@nestjs/swagger` 설치형 구성을 적용하지 않고, 서버가 직접 OpenAPI 문서를 제공하는 방식으로 시작합니다.
- API가 추가되면 컨트롤러 변경과 함께 OpenAPI 문서도 같은 작업에서 갱신합니다.

### 1.1 표준 응답 포맷

성공 응답

```json
{
  "success": true,
  "data": {}
}
```

실패 응답

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "권한이 없습니다.",
    "details": {}
  }
}
```

### 1.2 주요 에러 코드

- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `RATE_LIMITED`
- `EXTERNAL_AI_ERROR`
- `INSUFFICIENT_AI_TOKENS`
- `JOIN_DISABLED` (해당 가입 방식 토글이 꺼짐)
- `GROUP_FULL` (최대 인원 초과)
- `GROUP_CODE_INVALID` (그룹 코드 갱신으로 무효화 또는 미존재)
- `INVITE_EXPIRED` (이메일 초대 토큰 만료 또는 사용됨)
- `EMAIL_DELIVERY_ERROR`

## 2. 인증/사용자

### 2.1 OAuth 로그인 시작

- `GET /api/v1/auth/oauth/:provider/start`
- provider: `google` | `github`
- 동작
  - 서버가 `state` 값을 생성하고 httpOnly 쿠키(`psstudio_oauth_state`)로 저장합니다.
  - 브라우저를 provider authorization URL로 `302` redirect합니다.
- Google 로컬 redirect URI: `http://localhost:4000/api/v1/auth/oauth/google/callback`
- GitHub 로컬 redirect URI: `http://localhost:4000/api/v1/auth/oauth/github/callback`

### 2.2 OAuth 콜백

- `GET /api/v1/auth/oauth/:provider/callback`
- query: `code`, `state`
- 정책
  - OAuth만 지원, 이메일/비밀번호 로그인 미지원
  - 동일 이메일이라도 `google`/`github`는 별도 사용자로 생성
  - 사용자 프로필 이미지는 로그인 시마다 provider 값으로 동기화
  - 닉네임 기본값은 provider 표시명, 사용자 수정 가능
  - 닉네임 중복 허용
  - OAuth 환경변수는 `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI`를 사용
  - 세션은 Redis에 저장하고 쿠키 이름은 `SESSION_COOKIE_NAME`(기본 `psstudio_session`)입니다.

현재 구현 상태

- OAuth start는 provider authorization URL로 redirect합니다.
- OAuth callback은 authorization code를 access token으로 교환하고 userinfo를 조회합니다.
- 성공 시 Redis 세션을 만들고 httpOnly 세션 쿠키를 발급한 뒤 `FE_PUBLIC_BASE_URL`로 redirect합니다.

### 2.3 로그아웃

- `POST /api/v1/auth/logout`
- 인증 필요
- 동작: Redis 세션 삭제 + 세션 쿠키 삭제

### 2.4 내 정보 조회/수정

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
  - body: `{ "nickname": "새닉네임" }`

### 2.5 회원 탈퇴

- `DELETE /api/v1/users/me`
- 정책
  - 해당 OAuth 계정만 탈퇴 처리
  - 같은 이메일의 다른 OAuth 계정에 영향 없음
  - 탈퇴 사용자의 기존 제출/댓글은 작성자 이름과 함께 표시, 프로필 링크 비활성

## 3. 그룹

### 3.1 그룹 생성/조회/수정/삭제

- `POST /groups`
  - body(BE는 평탄 필드 사용. 의미는 아래 중첩 설명과 동일함)
    ```json
    {
      "name": "그룹명(최대 20자)",
      "description": "(선택) 최대 500자",
      "maxMembers": 10,
      "joinByCodeEnabled": true,
      "joinByLinkEnabled": true,
      "joinByRequestEnabled": true,
      "joinByEmailEnabled": true,
      "ruleUseDeadline": true,
      "ruleDefaultDeadlineTime": "23:59",
      "ruleAllowLateSubmission": true,
      "ruleUseAiFeedback": true,
      "ruleAllowEditAfterSubmit": true,
      "ruleAssignmentCreatorRoles": "OWNER_AND_MANAGER"
    }
    ```
  - 위 필드는 선택적으로 생략 가능하며, 생략 시 서버 기본값을 적용합니다.
  - 논리 구조로 표현하면 다음과 같습니다.
    - `joinMethods.code/link/request/email` ↔ `joinByCodeEnabled` 등.
    - `rules.*` ↔ `ruleUseDeadline`, `ruleDefaultDeadlineTime`, ….
  - 응답에 `groupCode`(8자, 새로 생성된 영구 코드)를 포함합니다.
- `GET /groups`
  - 응답: `[{ id, name, description, maxMembers, memberCount, ownerUserId, myRole, memberPreviews }]`
  - `memberPreviews`는 가입 시각 오름차순으로 최대 4명의 `{ userId, nickname, profileImageUrl }`를 포함합니다(아바타 스택 표시용).
- `GET /groups/:groupId`
  - 응답: 그룹의 모든 메타(이름/설명/최대 인원/멤버 수/그룹 코드/가입 방식 토글/그룹 규칙).
  - `groupCode`는 그룹원 모두에게 노출합니다(공유 토큰 성격).
- `PATCH /groups/:groupId`
  - 권한: 그룹장/그룹 관리자
  - body: 생성과 동일한 평탄 필드(`name`, `description`, `maxMembers`, `joinBy*Enabled`, `rule*`) 중 일부만 보내도 됩니다.
  - `maxMembers`는 현재 멤버 수보다 작게 설정 시 `VALIDATION_ERROR`.
- `POST /groups/:groupId/code/regenerate`
  - 권한: 그룹장만(그룹 관리자에게는 버튼·API 모두 비노출).
  - 새 8자 그룹 코드를 발급하고 응답에 포함합니다.
  - 기존 그룹 코드와 그것으로 만들어진 모든 초대 링크는 즉시 무효화(`revoked_at` 채움).
- `DELETE /groups/:groupId`
  - 권한: 그룹장만
  - body: `{ "confirmGroupName": "정확한 그룹명" }`

정책

- 그룹은 공개/비공개 구분이 없습니다. 외부 검색이나 비밀번호 보호도 두지 않습니다.
- 그룹장 탈퇴 불가, 그룹 삭제만 가능.
- 그룹 삭제 시 과제/제출/댓글/리뷰/AI 분석 결과/공지/커뮤니티/캘린더 함께 삭제.
- 알림 데이터는 그룹 삭제와 무관하게 삭제하지 않음.

### 3.2 그룹 역할/멤버 관리

- `GET /groups/:groupId/members`
- `PATCH /groups/:groupId/members/:userId/role`
  - body: `{ "role": "MANAGER|MEMBER" }` (그룹장 변경은 별도 위임 엔드포인트)
- `POST /groups/:groupId/transfer/:userId`
  - 그룹장 위임. 현재 그룹장은 `MANAGER`로 강등.
- `DELETE /groups/:groupId/members/:userId`
  - 권한: 그룹장/그룹 관리자(강퇴). 그룹장 강퇴는 거부.
- `DELETE /groups/:groupId/members/me`
  - 권한: 그룹원/그룹 관리자
  - 그룹장은 호출 불가(`CONFLICT`)

## 4. 그룹 가입

### 4.1 진입 메타데이터 조회

- `GET /invites/preview?code=:code` 또는 `GET /invites/preview?link=:linkToken` 또는 `GET /invites/preview?emailToken=:emailToken`
  - 응답: `{ groupId, name, description, memberCount, maxMembers, joinMethods }` (작성자/제출 코드 등 비공개 정보 미포함)
  - 그룹 코드 갱신 등으로 무효화된 코드 또는 링크는 `404 NOT_FOUND`.
  - 만료된 이메일 초대 토큰은 `404 INVITE_EXPIRED`.

### 4.2 그룹 코드로 가입

- `POST /invites/code/accept`
  - body: `{ "code": "8자리코드" }`
  - 정책
    - `joinMethods.code`가 `false`면 `FORBIDDEN JOIN_DISABLED`.
    - 그룹이 가득 차 있으면 `CONFLICT GROUP_FULL`.
    - 잘못된 코드는 `404 GROUP_CODE_INVALID`.
    - 코드 형식: 8글자, 영문 대소문자+숫자, 대소문자 구분(`COLLATE "C"`).
    - 실패 횟수 제한/잠금 정책 없음.

### 4.3 초대 링크로 가입

- `POST /groups/:groupId/invite-links`
  - 권한: 그룹장/그룹 관리자
  - 응답: `{ token, url }` (영구, 만료/한도 없음).
- `GET /groups/:groupId/invite-links`
  - 응답: 활성 링크 목록(현재 그룹 코드와 묶인 것들).
- `DELETE /groups/:groupId/invite-links/:linkId`
  - `revoked_at`을 채워 무효화.
- `POST /invites/link/:token/accept`
  - 정책
    - `joinMethods.link`가 `false`면 `FORBIDDEN JOIN_DISABLED`.
    - 무효화/미존재 토큰은 `404 GROUP_CODE_INVALID`.
    - 그룹 가득 시 `CONFLICT GROUP_FULL`.

### 4.4 가입 신청

- `POST /groups/:groupId/join-requests`
  - `joinMethods.request`가 `false`면 `FORBIDDEN JOIN_DISABLED`.
  - 이미 멤버인 경우 `CONFLICT`. 같은 PENDING이 있으면 그대로 반환.
  - 정원이 가득해도 신청 자체는 받습니다(승인 시점에 가득 검사).
- `GET /groups/:groupId/join-requests?status=PENDING|APPROVED|REJECTED`
- `POST /groups/:groupId/join-requests/:requestId/decide`
  - body: `{ "decision": "APPROVED" | "REJECTED" }`. 트랜잭션 안에서 멤버 추가까지 수행. 승인 시점에 그룹이 가득 차 있으면 `CONFLICT GROUP_FULL`로 거부합니다(`PENDING` 상태 유지).
  - `joinMethods.request`가 `false`(가입 신청 토글 off)일 때 `APPROVED`는 `FORBIDDEN JOIN_DISABLED`로 거부하고 `REJECTED`는 그대로 허용합니다. 토글이 다시 켜지면 두 결정 모두 허용됩니다.

정책

- 가입 신청 메시지 없음.

### 4.5 이메일 초대

- `POST /groups/:groupId/email-invites`
  - 권한: 그룹장/그룹 관리자
  - body: `{ "emails": ["a@x.com", "b@y.com"] }` (배치 발송, 최대 20개)
  - `joinMethods.email`이 `false`면 `FORBIDDEN JOIN_DISABLED`.
  - 각 주소에 1회용 토큰을 만들어 Resend로 발송. TTL 7일.
  - 그룹당 1시간 내 50건 발송 제한. 초과 시 `RATE_LIMITED`로 거부합니다(이미 발송된 N건은 성공, 초과분만 실패).
  - 같은 주소에 활성 PENDING 토큰이 있으면 기존 토큰을 만료 처리한 뒤 새 토큰을 발급합니다(중복 발송 방지).
  - 응답: `{ sent: number, failed: [{ email, reason }] }`.
- `GET /groups/:groupId/email-invites`
  - 응답: 활성/만료된 초대 목록.
- `DELETE /groups/:groupId/email-invites/:inviteId`
  - 즉시 만료 처리.
- `POST /invites/email/:token/accept`
  - 인증 필요. 미인증이면 FE는 `/login?next=...`로 안내.
  - 토큰 만료/사용됨이면 `404 INVITE_EXPIRED`.
  - `joinMethods.email`이 `false`면 `FORBIDDEN JOIN_DISABLED`.

## 5. 과제(Assignment)

### 5.1 생성/조회/수정/삭제

- `POST /groups/:groupId/assignments`
  - body: `{ title, hint?, problemUrl, dueAt(ISO UTC), allowLateSubmission }`
- `GET /groups/:groupId/assignments`
- `GET /assignments/:assignmentId` (그룹 prefix 없이 단일 ID 라우트)
- `PATCH /assignments/:assignmentId`
- `PATCH /assignments/:assignmentId/metadata`
  - body: `{ title?, difficulty?, platform?, algorithms?, hintHiddenUntilSubmit?, algorithmsHiddenUntilSubmit? }` (수동 메타데이터 입력 fallback)
- `POST /groups/:groupId/assignments/autofill`
  - body: `{ "problemUrl": "https://..." }`
  - 응답: `{ title, hint, algorithms, difficulty }`
  - `title`은 `Programmers`·`BOJ`·`LeetCode`일 때 문제 페이지 HTML에서 추출한 공식 명칭을 우선하고, 추출 실패 시에만 AI가 제안한 문자열을 사용합니다. `Other`는 AI 제목만 사용합니다.
  - `hint`는 문제 원문 복사가 아닌 풀이 힌트 텍스트여야 합니다.
  - `algorithms`는 1개 이상이어야 하며, 비어 있으면 서버가 실패 처리합니다.
  - `algorithms`는 서버 허용 키워드 목록 중에서만 선택해 반환해야 합니다.
  - 서버는 AI 호출 전에 문제 HTML 본문 유효성을 검사합니다. `입력`/`출력` 키워드 쌍 또는 코드 에디터 블록(`code-editor`, `codehilite`, `rouge-code`)이 하나도 확인되지 않으면 AI를 호출하지 않고 `BAD_REQUEST`로 실패합니다.
  - `difficulty`는 플랫폼별 포맷으로 반환합니다.
    - BOJ: `B5~R1`
    - Programmers: `Lv. 0~Lv. 5`
    - LeetCode: `Easy|Medium|Hard`
  - BOJ/Programmers 난이도는 AI 추정값을 사용하지 않고 문제 페이지 메타데이터 기반으로만 채웁니다. 메타 추출 실패 시 빈 문자열을 반환합니다.
- `GET /assignments/:assignmentId/deletion-impact`
  - 응답: `{ submissionCount, reviewCount, commentCount }`
- `DELETE /assignments/:assignmentId`
  - body: `{ "confirmTitle": "정확한 과제명" }`
  - 권한: 그룹장/그룹 관리자

정책

- 과제는 문제 1개만 연결
- 설명/메모는 plain text만 지원
- 삭제 확인 문구 `삭제하시겠습니까?`
- 과제 삭제 시 제출 코드, 댓글, 리뷰, AI 분석 결과 함께 삭제
- 삭제된 과제 알림 클릭 시 `관련 페이지가 삭제되었습니다` 메시지 표시
- 과제 삭제자는 별도로 기록하지 않음

## 6. 문제 메타데이터/분석

### 6.1 문제 분석 실행

- `POST /groups/:groupId/assignments/:assignmentId/problem-analysis`
  - 권한: 그룹장/그룹 관리자

### 6.2 문제 메타데이터 수정

- `PATCH /groups/:groupId/assignments/:assignmentId/problem`

정책

- 문제 본문 저장/표시 안함
- URL, 플랫폼, 제목, 난이도, 알고리즘 태그 등 메타데이터 중심 저장
- 미지원 URL은 AI가 판단, 실패 시 `기타`
- 같은 문제 링크 중복 등록 허용

## 7. 제출(Submission)

### 7.1 제출 생성/조회/삭제

- `POST /assignments/:assignmentId/submissions`
  - body: `{ "title"?: "...", "language": "python", "code": "...", "noteMarkdown"?: "..." }` (code 200KB 제한, note 20,000자 제한)
- `GET /assignments/:assignmentId/submissions`
  - query: `sort=createdAtAsc|createdAtDesc`, `authorId`, `language`, `isLate=true|false`
- `GET /submissions/:submissionId`
  - 응답에 `versions[]`(versionNo·language·createdAt) 포함, `latestCode`도 포함
- `GET /submissions/:submissionId/versions/:versionNo`
  - 응답: `{ language, code }`
- `PATCH /submissions/:submissionId/code`
  - 새 버전을 누적. 같은 제출 안에서 언어 변경은 거부.
  - 그룹 규칙 `allowEditAfterSubmit`이 `false`이면 `FORBIDDEN`.
- `PATCH /submissions/:submissionId/metadata`
  - body: `{ title?, algorithms?[] }` 같은 메타데이터 부분 수정.
  - 메타데이터만 수정하므로 새 버전을 만들지 않습니다(덮어쓰기).
- `PATCH /submissions/:submissionId/title`
  - 별칭 — `metadata` PATCH의 단순 호출.
- `PATCH /submissions/:submissionId/note`
  - body: `{ "noteMarkdown": "..." }`
  - 메모는 제출 단위 단일 본문을 덮어쓰기하며 버전을 만들지 않습니다.
- `DELETE /submissions/:submissionId`
  - 작성자 또는 그룹장/관리자 가능. 댓글/리뷰/diff/AI 분석을 함께 삭제.
- `GET /submissions/:submissionId/diff?from&to`
  - DB 캐시. patch 형식 텍스트 반환.
- `POST /submissions/detect-language`
  - body: `{ code }`. 응답: `{ best, scores }` (BE 키워드 1차 감지)
- `DELETE /groups/:groupId/assignments/:assignmentId/submissions/:submissionId`

정책

- 코드 길이 200KB 제한
- 파일 업로드 미지원
- 제출 삭제 시 해당 제출 댓글/리뷰 함께 삭제
- 제출 삭제 확인 문구 `삭제하시겠습니까?`

### 7.2 제출 수정/버전

- `PATCH /groups/:groupId/assignments/:assignmentId/submissions/:submissionId`
  - body가 `code`를 포함하면 새 버전 증가.
  - body가 메타데이터만 포함하면 덮어쓰기(버전 미증가).
- `GET /groups/:groupId/assignments/:assignmentId/submissions/:submissionId/versions`
- `GET /groups/:groupId/assignments/:assignmentId/submissions/:submissionId/diff`
  - query: `fromVersion`, `toVersion`

정책

- 제출 후 코드 수정은 그룹 규칙 `allowEditAfterSubmit`을 따릅니다.
- 메타데이터 수정은 `allowEditAfterSubmit`과 무관하게 항상 허용합니다.
- `title`/`noteMarkdown` 수정은 메타데이터 수정으로 취급하며 새 버전을 만들지 않습니다.
- 언어 변경은 수정이 아니라 별도 제출 생성으로 처리합니다.
- 이전 버전 되돌리기는 지원하지 않습니다.
- diff 화면은 현재 선택 버전 변경사항과 해당 버전 인라인 댓글·리뷰만 표시합니다.
- 댓글·코드 리뷰는 제출 버전(`submission_version_id`)에 귀속되며, 새 코드 버전이 만들어지면 자동 매핑되지 않습니다.

## 8. 댓글/코드리뷰

### 8.1 과제 댓글

- `POST /groups/:groupId/assignments/:assignmentId/comments`
- `GET /groups/:groupId/assignments/:assignmentId/comments`

### 8.2 제출 댓글/리뷰

- `POST /api/v1/submissions/:submissionId/comments`
  - body: `{ "body": "...", "parentCommentId"?: "<uuid>" }`. `parentCommentId`가 비어 있으면 새 댓글, 있으면 답글입니다(8.4).
- `GET /api/v1/submissions/:submissionId/comments`
  - 응답: 부모 댓글 배열. 각 항목은 `replies`(같은 제출에 달린 답글 평면 배열)와 `reactions` 인라인 요약을 포함합니다.
- `POST /api/v1/submissions/:submissionId/reviews`
  - body: `{ versionNo, startLine, endLine?, body }`. 라인/범위/파일전체/제출전체 리뷰 지원.
- `GET /api/v1/submissions/:submissionId/reviews?versionNo=:n`
  - 응답: 각 리뷰는 `replies[]`(`REVIEW_REPLIES`)와 `reactions` 요약을 인라인으로 포함합니다.

### 8.3 수정/삭제

- `PATCH /comments/:commentId`
- `DELETE /comments/:commentId`
- `PATCH /reviews/:reviewId`
- `DELETE /reviews/:reviewId`

정책

- 작성자 삭제: 실제 삭제
- 관리자 삭제: 본문 `삭제된 댓글입니다` 대체(작성자/시각/답글 유지)
- `@` 멘션 대상은 같은 그룹원으로 제한
- 리뷰는 버전별 분리 저장, 새 버전에 이전 라인 리뷰 매핑하지 않음

### 8.4 답글 (대댓글)

코드 리뷰 답글

- `GET /api/v1/reviews/:reviewId/replies`
  - 응답: `[{ id, reviewId, authorUserId, authorNickname, authorProfileImageUrl, body, reactions, createdAt, updatedAt, isAdminHidden, isAiBot }]`.
- `POST /api/v1/reviews/:reviewId/replies`
  - body: `{ "body": "..." }`.
- `PATCH /api/v1/review-replies/:replyId`
  - 작성자만 가능. body 수정.
- `DELETE /api/v1/review-replies/:replyId`
  - 작성자: 실삭제. 그룹장/그룹 관리자: `is_admin_hidden = true`로 가림 처리.

제출/과제 댓글 답글

- `POST /api/v1/comments/:parentCommentId/replies`
  - 같은 `comments` 테이블 안에 `parent_comment_id`로 연결합니다.
- `GET /api/v1/comments/:parentCommentId/replies`
- `PATCH /api/v1/comments/:commentId`, `DELETE /api/v1/comments/:commentId`는 8.3을 그대로 사용합니다.

정책

- 답글 깊이는 1단으로 제한합니다. 답글에 다는 답글도 같은 부모 스레드 아래에 평면적으로 쌓입니다.
- 코드 리뷰 답글 응답 DTO는 부모 리뷰의 `reactions`와 동일한 형식의 `reactions` 필드를 가집니다.
- 답글 알림은 5.5절의 댓글 알림 정책과 동일합니다.

### 8.5 이모지 반응 (Reactions)

- `POST /api/v1/reactions`
  - body: `{ "targetType": "review|review_reply|comment|post_comment", "targetId": "<uuid>", "emoji": "👍" }`.
  - 동작: 같은 `(targetType, targetId, userId, emoji)`가 이미 있으면 그대로 두고 `idempotent`하게 200 반환합니다.
  - 응답: `{ id, targetType, targetId, userId, emoji, createdAt }`.
- `DELETE /api/v1/reactions`
  - body: `{ "targetType", "targetId", "emoji" }`. 본인 반응만 삭제 가능.
- `GET /api/v1/reactions?targetType=review&targetIds=<uuid>,<uuid>...`
  - 응답: `[{ targetType, targetId, summary: [{ emoji, count, userIds: [<uuid>...] , reactedByMe: bool }] }]`.
  - 일반적으로는 부모 리소스 응답에 `reactions` 필드를 인라인으로 포함하므로 별도 호출은 선택입니다.

응답에 인라인 포함되는 `reactions` 필드 형식

```json
[
  { "emoji": "👍", "count": 3, "reactedByMe": true, "userIds": ["<uuid>", "<uuid>", "<uuid>"] },
  { "emoji": "🎉", "count": 1, "reactedByMe": false, "userIds": ["<uuid>"] }
]
```

정책

- `(targetType, targetId, userId, emoji)`는 unique. 같은 사용자가 같은 대상에 같은 이모지를 두 번 달 수 없습니다.
- 같은 사용자가 같은 대상에 다른 이모지는 여러 개 달 수 있습니다.
- emoji 문자열은 1~32자, 단순 검증만 하고 유니코드 범위는 제한하지 않습니다.
- 대상 댓글/리뷰/답글이 실삭제될 때 reactions 도 함께 삭제합니다(애플리케이션 레벨 cascade).
- AI 봇 댓글에도 사용자가 이모지를 달 수 있습니다. 봇은 이모지를 달지 않습니다.
- 이모지 반응은 알림 이벤트를 발행하지 않습니다.

## 9. 그룹 규칙

피드백 공개 정책 매트릭스 API는 두지 않습니다. 그룹 규칙 단일 source는 `PATCH /groups/:groupId`로 갱신합니다(3.1 참조).

- 그룹원은 같은 그룹의 모든 제출/댓글/코드 리뷰를 조회할 수 있습니다.
- AI 코드 리뷰 활성 여부는 `rules.useAiFeedback`만으로 결정됩니다.
- `rules.allowEditAfterSubmit`이 `false`이면 제출 코드 수정 API는 `FORBIDDEN`을 반환합니다.
- 그룹 규칙 변경은 기존 과제에 소급되지 않고 새 과제부터 적용됩니다.
- 그룹 규칙 변경 시 그룹원에게 알림을 보내지 않습니다.

## 10. AI 코드 리뷰

### 10.1 제출 AI 코드 리뷰 트리거

- `POST /submissions/:submissionId/ai-review`
  - 권한: 제출 작성자, 그룹장, 그룹 관리자.
  - 동작: 명시적 트리거. 현재 최신 버전 또는 명시한 버전(`?versionNo=...`)에 대해 AI 코드 리뷰 작업을 큐로 발행합니다.
  - 새 제출 또는 새 코드 버전이 자동으로 이 API를 호출하지 않습니다.
  - `rules.useAiFeedback`이 `false`인 그룹은 `FORBIDDEN`.
  - 이미 같은 버전에 `RUNNING` 상태 run이 있으면 `CONFLICT`로 거부합니다.
- `GET /submissions/:submissionId/ai-reviews`
  - 응답: `[{ runId, versionNo, status, startedAt, finishedAt, tokenUsed, failureReason }]`.

### 10.2 결과 조회

- AI 코드 리뷰 결과는 별도 패널이 아니라 같은 제출 댓글/코드 리뷰 API로 조회합니다.
- 댓글·리뷰 응답에 `isAiBot: true`, `aiReviewRunId`, 작성자 표시명 `AI 튜터`가 포함됩니다.
- AI 봇이 작성한 댓글·리뷰 본문에는 코드 일부의 `+`/`-` 형식 diff가 포함될 수 있습니다.

### 10.3 정책

- AI 코드 리뷰 1회 실행이 성공해 댓글이 등록된 경우에만 토큰 차감. 차감량은 선택한 provider 응답 `usage.total_tokens`(입력+출력 합)을 그대로 사용합니다.
- 실패/타임아웃/취소는 0 차감.
- 토큰 부족 시 `INSUFFICIENT_AI_TOKENS`.
- LLM 호출 실패 시 worker가 자동 1회 재시도(짧은 backoff). 재시도까지 실패하면 `AI_REVIEW_RUNS.status='FAILED'`로 기록하고 제출 작성자에게만 실패 알림 발송.
- 같은 버전에 AI 리뷰를 여러 번 트리거하면 결과가 누적됩니다. 이전 봇 댓글을 자동 삭제하지 않으며 작성 시각으로 구분합니다.
- AI 봇 댓글·리뷰 삭제는 그룹장/그룹 관리자만 가능합니다(작성자는 답글만 가능).
- 작성자 표시는 단일 시스템 사용자 `AI 튜터`(`is_system_bot=true`)입니다.
- AI 코드 리뷰 완료/실패 알림 수신자는 제출 작성자 1명입니다(트리거 사용자에게 별도 알림 없음).
- AI 코드 리뷰는 프롬프트 구성 시 과제 `problemUrl`을 서버가 직접 fetch해 문제 본문 핵심(`요약`, `입력`, `출력`)을 추출하고, 코드+메모와 함께 LLM 입력으로 전달합니다.
- 추출된 문제 본문 원문 HTML/텍스트는 저장하지 않고 요청 처리 중 메모리에서만 사용 후 폐기합니다.
- 문제 URL fetch 요청의 `User-Agent`는 매 요청마다 랜덤하게 선택합니다.

### 10.4 문제 분석

- `POST /assignments/:assignmentId/problem-analysis`
  - 권한: 그룹장/그룹 관리자.
  - 백엔드/worker가 `problem_url`에 직접 HTTP 요청해 HTML을 가져온 뒤 LLM에 입력합니다. 클라이언트는 직접 URL을 fetch 하지 않습니다.
  - 4xx/5xx, 타임아웃, 봇 차단 페이지를 받으면 자동 재시도 없이 `PROBLEM_ANALYSES.status='FAILED'`로 기록하고 사용자에게 "수동으로 메타데이터를 입력해 주세요" 알림.
  - 결과는 `assignments` 메타에 머지되고, 사용자가 다시 수동 수정할 수 있습니다.

## 11. 과제 집단 코드 비교 분석

제출 코드 기계 번역 API·`SUBMISSION_TRANSLATIONS` 테이블은 **현재 제공하지 않습니다**(`design/design.md` 5.4.4).

정책 요약은 `design/design.md` 5.4.5를 따릅니다.

### 11.1 트리거·조회

- `POST /assignments/:assignmentId/cohort-analysis`
  - 권한: 같은 그룹의 모든 멤버(세부는 구현 시 `design.md`와 동일한 그룹원 공개 모델을 따름).
  - 헤더: `Accept-Language`로 리포트·역할 라벨 로케일(`ko`/`en` 등)을 결정한다. 웹 클라이언트는 브라우저 기본 헤더 대신 **앱에서 선택한 UI 언어**를 우선 반영해 요청한다.
  - 본문(선택): JSON `{ "rerun": true }` — 완료(`DONE`) 또는 실패(`FAILED`) 집단 분석 행을 **DB에서 삭제**(멤버 행 포함)한 뒤 새 분석 행을 만들고 파이프라인을 다시 시작한다. `RUNNING`이면 `409 Conflict`. 기본(본문 없음 또는 `rerun` 미설정)은 기존과 같다(`DONE`이면 `409`, `FAILED`면 동일 행을 초기화해 재시도).
  - 전제: 과제 마감 경과, 유효 제출 2건 이상.
  - 동작: 비동기 파이프라인 실행. 파이프라인 시작 시 과제 `problem_url`에서 위와 동일한 규칙으로 문제 본문을 추출해 LLM 입력 JSON에 `problemContext`(실패 시 `null`)·`problemUrl`을 포함한다. 각 제출은 DB 스냅샷 원문 **`source`(그대로)**와 **`lines`(`source.split('\\n')`, 빈 줄은 `\"\"`)**를 함께 넣으며 **`lines.join('\\n') === source`**로 줄 번호를 고정한다(LLM이 빈 줄을 건너뛰지 않도록 명시). 리포트는 문제 요구와 제출 간 교차 비교를 서술하도록 프롬프트한다.
  - `rerun` 없이 이미 해당 과제에 `DONE` 상태의 집단 분석이 있으면 `409 Conflict`.
  - 실패한 이전 시도가 있으면 재시도 허용. 성공(`DONE`) 확정 전까지는 새 제출·새 버전이 다음 시도의 입력 집합에 포함될 수 있음.
- `GET /assignments/:assignmentId/cohort-analysis`
  - 응답: `status`(`RUNNING|DONE|FAILED`), `reportLocale`, 진행/실패 메시지, 완료 시 `reportMarkdown`, `artifacts`(`submissions[]`: 제출별 `submissionId`, `regions[]`의 `roleId`·`roleLabel`·줄 범위, 조회 시 병합된 `code`·`language`), `tokenUsed`, 성공 시 포함된 제출 스냅샷(`versionNo`, `title`, `authorProfileImageUrl`, 닉네임 등). DB `artifacts` JSON에는 `regions`만 저장하고 코드 본문은 저장하지 않는다.

### 11.2 정책

- 역할 구역·리포트는 **단일 LLM JSON**으로 생성하며, **파싱 검증 실패 시 전체 `FAILED`**. 코드 **실행·컴파일 검증은 하지 않음**. LLM은 구역별 줄번호를 직접 내지 않고 `startAnchorText`·`endAnchorText`를 제출하며, 서버가 각 제출의 **원문 `source`**에서 앵커를 찾아 줄번호를 계산한다. 프롬프트는 앵커를 입력 JSON의 **`lines` 연속 원소 그대로**(리포트 본문·펜스와 불일치해도 됨) 두도록 요구해 `cohort_bundle_anchor_not_found`를 줄인다. 입력 `lines`는 `source.split('\n')`(빈 줄 `""` 유지, `trim` 금지)와 동일하며 앵커 매핑 후 줄 범위를 클램프한다. **제출 간 구역 개수·`roleId` 집합을 일치시키지 않으며**, 서버는 제출별 regions만 검증·시작 줄 기준 정렬한다. **제출당 구역은 1~5개**, 예약 식별자 `whole_file` 및 제출 내 `roleId` 중복은 거절한다. 원문 코드 **전체 줄 수가 12줄 이상**인 제출은 구역 **2~5개**이며 각 구역은 **최소 2줄** 범위를 가져야 하고, **`entire_code` 식별자·구역 1개만으로 전체를 덮는 출력**은 거절한다. LLM이 **`regions: []`**를 내거나 12줄 이상 제출에서 유효 구역 객체가 한 건뿐이면 서버가 전체 한 구역으로 바뀐 뒤 동일하게 거절(`cohort_bundle_regions_semantic_required`)된다. 파이프라인은 동일 요청에 대해 모델 호출을 재시도할 수 있다.
- 리포트 `reportMarkdown`의 코드 펜스는 **설명과 연결된 발췌**만 두고, 제출 전체 코드를 그대로 붙이지 않는 것을 프롬프트로 요구한다. 본문 각 절의 인용은 **해당 제출 `artifacts.regions`의 한 구역 앵커 범위 안 원문**만 근거로 삼도록 프롬프트로 요구한다. 개요에서 비교 축 순서를 서술한 경우 그 순서·주제와 **regions·본문 `##` 축**이 같은 판단 기준을 쓰도록 프롬프트로 요구한다. **표는 사용하지 않는다**(HTML `<table>`·Markdown 파이프 표 금지 — UI 렌더 불안정). 여러 제출을 한 축에서 비교할 때는 소제목·목록·단락으로만 나열하고, 축마다 **펜스 코드 스니펫**을 두도록 요구한다. 원문이 **12줄 이상**이면 프롬프트에서 **앵커 변환 후 각 region이 최소 2줄 이상**이 되도록 요구해 한 줄짜리 구역(`cohort_bundle_regions_too_fine`) 출력을 줄인다.
- 집단 분석 LLM **시스템 프롬프트**에는 저장소 루트 `design/cohort-report-template.example.md` 전문을 **참고 본문**으로 삽입해 비교 서술·`[[SUBMISSION:uuid]]`·표 없는 나열 방식·펜스 배치 품질을 맞춘다. 해당 파일의 `###` 소제목 체계는 문체 샘플일 뿐이며, 실제 `reportMarkdown`의 비교 축 제목은 **`##` 비교 주제 + (선택) 백틱 대표 `roleId`** 규약이 우선한다(프롬프트에 명시).
- 리포트 본문에서 제출 참조는 `[[SUBMISSION:<uuid>]]` 플레이스홀더만 허용하는 것을 원칙으로 한다. 파싱 직후 서버가 알려진 `submissionId`에 한해 본문의 노출 UUID·`submission <uuid>` 형태를 동일 플레이스홀더로 치환해 저장한다. 저장 전 정규화 단계에서 구 스타일 절 `## 제출 요약`·`## Submission summary`(다음 `##` 직전까지)를 제거하고, 빈 꼭지용 단일 줄 제목(예: `## 제출 간 비교 개요`, `## 문제 요약과 목표`, 영문 `## Problem summary` 등)도 제거한다(제출 식별은 본문 삽입 태그에 맡김).
- 데드 코드(미사용 선언) 강조는 **정적 분석** 기반이며 집단 비교 역할 구역 판단에는 사용하지 않음.
- 결과 산출물·API 응답·DB·로그 어디에도 **모델명·프롬프트 버전·시드 등 LLM 구성 메타를 저장하지 않음**.
- 과제 삭제 시 집단 분석 결과는 제출 등과 함께 삭제.

## 12. 알림

### 12.1 조회/읽음/삭제

- `GET /notifications`
- `POST /notifications/read-all`
- `POST /notifications/:notificationId/read`
- `DELETE /notifications/:notificationId`
- `DELETE /notifications`

정책

- 알림 TTL 없음
- 사용자가 삭제하기 전까지 보관
- 그룹 삭제 이후에도 기존 알림 유지
- 알림 클릭 대상이 삭제된 경우 `관련 페이지가 삭제되었습니다` 메시지 표시

### 12.2 홈 대시보드 (미구현 — TODO)

홈 화면(`/`)의 “최근 알림”, “최근 푼 문제” 카드는 현재 FE(`fe/app/HomeClient.tsx`)에 비어 있는 props로만 연결돼 있습니다. 다음 두 API를 추가해 서버 컴포넌트에서 주입합니다.

- `GET /api/v1/users/me/notifications?limit=5`
  - 응답: `[{ id, title, createdAt }]` 최신순.
  - 권한: 본인.
- `GET /api/v1/users/me/submissions?limit=5&sort=createdAtDesc`
  - 응답: `[{ id, title, language, createdAt, href }]` 최신 제출순.
  - `href`는 `/groups/:groupId/assignments/:assignmentId/submissions/:submissionId` 형태.
  - 권한: 본인. 같은 그룹의 다른 사용자 제출은 별도 API에서 처리합니다.

## 13. 캘린더/검색/게시판

### 13.1 캘린더

- `GET /groups/:groupId/calendar`
  - query: `view=week|month`, `date`, `filters...`

### 13.2 과제 검색

- `GET /groups/:groupId/assignments/search`
  - 기본 정렬: deadline 임박순
  - 보조 정렬: 최신 과제순

### 13.3 공지/커뮤니티

- `POST /groups/:groupId/announcements`
- `GET /groups/:groupId/announcements`
- `POST /groups/:groupId/announcements/:postId/comments`
- `POST /groups/:groupId/community-posts`
- `GET /groups/:groupId/community-posts`
- `POST /groups/:groupId/community-posts/:postId/comments`

정책

- 공지: 그룹장/그룹 관리자 작성
- 커뮤니티 글: 그룹원 작성 가능
- 본문 Markdown 지원, 첨부파일/이미지 미지원
