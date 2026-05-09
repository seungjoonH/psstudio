# PS Studio 구현 체크리스트

이 문서는 구현 전·중·후의 단일 실행 체크리스트입니다.
이 체크리스트는 작성자 본인뿐 아니라 다른 AI 에이전트도 함께 사용합니다.
모든 작업자는 반드시 진행 내역과 이 문서를 동기화해야 합니다.

> 이번 갱신의 목표는 “MVP가 아닌 완성형”을 한 번에 끝내는 것입니다.
> 작은 슬라이스로 끝내고 다시 손대면 잘 되던 것까지 회귀하므로,
> 처음부터 Phase 0 → Phase 14 순서로 끝까지 닫는 것을 원칙으로 합니다.

## 0. 공통 운영 규칙

- `karpathy-guidelines` 규칙은 기본값으로 항상 적용합니다.
- 작업 시작 전 반드시 `design/design.md`, `design/api-spec.md`, `design/erd.md`, `design/architecture.md`, `design/ui.md`를 최신 기준으로 확인합니다.
- UI 작업에서 `design/ui/` 아래 HTML과 스크린샷은 레이아웃 참고용으로만 사용합니다.
- UI 작업의 최종 기준은 `design/design.md`와 실제 사용자 흐름이며, `design/ui.md`의 화면 번호 매핑도 고정 정답으로 취급하지 않습니다.
- 어떤 작업이든 아래 루프를 반드시 지킵니다.
  - `todo 확인 -> 구현 -> 단위 테스트 작성 및 통과 -> todo 했음 체크`.
- 브랜치 전략은 다음을 강제합니다.
  - AI 작업 브랜치는 `develop` 기준으로 기능 단위 커밋을 수행합니다.
  - `main` 브랜치는 개발자 전용 관리 브랜치로 두고, AI는 절대 건드리지 않습니다.
- 체크박스 상태는 실시간으로 갱신합니다.
  - 작업 시작 시 `[ ]` -> `[-]`(진행중)로 표시.
  - 단위 테스트 통과 후 `[-]` -> `[x]`로 표시.
- 완료 처리 기준.
  - 구현 코드 존재.
  - 단위 테스트 작성 및 통과.
  - 검증 명령 실행과 결과 기록.
  - 체크박스 완료 반영.
- 체크리스트 업데이트 없이 코드만 변경하는 행위를 금지합니다.
- 설계가 바뀌면 설계 문서와 체크리스트를 같은 작업에서 함께 업데이트합니다.
- 한국어 출력은 콜론 종결 금지를 지킵니다. 문장 끝은 `.`, `?`, `!`만 허용합니다.
- 새로 만드는 모든 소스 파일 첫 줄에는 한국어 한 줄 헤더 주석을 답니다.

## 1. 진행 상태 표기 규칙

- `[ ]` 미시작.
- `[-]` 진행중.
- `[x]` 완료.
- `[!]` 블로커 발생.

블로커 발생 시 반드시 아래 형식으로 기록합니다.

- 원인.
- 영향 범위.
- 임시 우회 여부.
- 다음 액션.

---

## 2. 프로젝트 결정사항(2026-05-07 2차 갱신)

이번 회의에서 확정한 사항입니다. 다른 옵션을 다시 비교하지 않고 이대로 진행합니다.

> 2026-05-07 추가 합의(그룹·AI·번역·이메일 초대 모델 변경) 요약. 자세한 내용은 §2.12를 보고 그 외 문서(design/api-spec/erd/architecture/ui)는 본 회의 후 갱신본을 단일 source로 따릅니다.

### 2.1 범위와 목표

- 1차 릴리스는 **완성형**으로 빌드합니다. “MVP만” 빼고 나중에 추가하는 방식은 회귀 위험이 커서 금지합니다.
- 사용자 시나리오 끝까지 돌려야 하는 핵심 흐름은 다음과 같습니다.
  - OAuth 로그인 → 그룹 생성/가입 → 과제 생성 → 코드 제출 → 댓글/리뷰 → AI 분석 → 알림 → 캘린더 → 공지/커뮤니티.
- AI는 LLM API를 실제 호출합니다. mock 만으로 끝내지 않습니다.
- AI 토큰(기본 100,000)과 관리자 충전은 1차에 포함합니다.
- 단위 테스트는 구현과 함께 작성하고 커버리지 목표는 BE 70~80%, FE 60% 이상입니다.
- E2E(Playwright)는 마지막 Phase 14에서 일괄 진행합니다.

### 2.2 인증과 세션

- 세션은 **httpOnly + Secure + SameSite=Lax 쿠키**로 발급합니다.
- 세션 레코드는 Redis 세션(`session:{id}`)을 우선합니다. 회복 가능성 위해 DB 백업 테이블은 두지 않습니다.
- 로그아웃, 강퇴, 탈퇴 시 즉시 무효화합니다.
- FE는 `credentials: 'include'`로 호출하고 JWT 디코딩 코드는 두지 않습니다.

### 2.3 데이터 계층

- ORM은 **TypeORM**으로 단일화합니다. `synchronize: false`를 강제하고 모든 변경은 `migration:generate`로 추적합니다.
- 로컬 DB는 Docker Compose의 Postgres 단일 컨테이너만 사용합니다. Supabase JS SDK는 도입하지 않습니다.
- DB 컬럼은 `timestamptz` UTC 저장, KST 표시는 표시 단계에서만 처리합니다.
- 시드 스크립트(`seed:dev`)로 데모 사용자/그룹/과제를 만들 수 있게 합니다.

### 2.4 모노레포 구조

- `pnpm-workspace.yaml`에 `packages/shared`를 신규 추가합니다.
- `packages/shared`는 다음을 소유합니다.
  - DTO 타입과 zod 스키마.
  - 공통 enum(역할, 알림 타입, 과제 상태 등).
  - 공통 응답 포맷 타입(`success/data`, `success/error`).
  - 공통 시간 유틸 인터페이스.
- BE와 FE는 `packages/shared`만 import하고 서로 import하지 않습니다.

### 2.5 프론트엔드 스타일

- 스타일은 **CSS Module + CSS 변수 토큰**만 사용합니다. TailwindCSS는 도입하지 않습니다.
- 컴포넌트 클래스 조합은 `src/lib/buildCls.ts` 단일 유틸로 처리합니다.
- 아이콘은 `icons.svg` 스프라이트(`<symbol>`) 기반으로 관리합니다.
  - `viewBox`는 모든 심볼이 동일합니다.
  - `fill="currentColor"`를 강제합니다.
  - 공통 `Icon` 컴포넌트에서 `<use href={...}>`로 렌더링합니다.
- 라이트/다크 토큰은 `:root`와 `[data-theme="dark"]`에 둡니다. 컴포넌트는 변수만 소비합니다.
- 모든 한국어/영어 텍스트는 i18n 리소스를 통해 조회합니다. 하드코딩 금지.
- AppShell 구조는 데스크탑은 `좌측 사이드바 + 상단바 + (선택적 우측 패널)`, 모바일은 `상단바 + 하단 탭 + 좌측 드로어`입니다.
- UI 디자인은 작업자에게 위임합니다. `design/ui/`는 레이아웃 참고용일 뿐 정답으로 취급하지 않습니다.

### 2.6 데이터 페치와 BFF

- 페이지 기본은 Next.js Server Component에서 직접 BE를 호출합니다.
- 클라이언트 동적 데이터(목록 페이지네이션, 알림 폴링/SSE 보조 등)는 **TanStack Query**로 처리합니다.
- 인증 쿠키는 브라우저 ↔ NestJS 직통으로 동작하며, SSR fetch만 Next.js Route Handler가 쿠키를 forward합니다.
- BE CORS는 `FE_PUBLIC_BASE_URL` 1개만 allow하고 `credentials: true`를 활성화합니다.

### 2.7 큐와 실시간 알림

- 큐는 **BullMQ on Redis**로 단일화합니다. NestJS는 `@nestjs/bullmq` 어댑터를 사용합니다.
- 작업 큐 종류는 다음과 같습니다.
  - `problem.analyze`.
  - `submission.analyze`.
  - `notify.deadline-soon`.
  - `notify.fanout`.
- 인앱 알림 푸시는 **SSE**(NestJS Message Event 스트림)를 사용합니다. 폴링은 보조용으로만 둡니다.

### 2.8 LLM 공급자

- LLM 공급자는 **OpenRouter**로 단일화합니다.
- 환경변수는 OpenRouter 호출용 **`LLM_API_KEY`**를 사용합니다.
- 모델은 기능별 분리합니다.
  - `LLM_MODEL_PROBLEM_ANALYZE`.
  - `LLM_MODEL_SUBMISSION_ANALYZE`.
- 프롬프트 템플릿은 기능별 yaml 또는 ts 파일로 관리합니다(`design.md` 5.4 정책).
- 토큰 차감은 성공한 분석에만 발생합니다.
- 토큰 부족은 `INSUFFICIENT_AI_TOKENS` 에러 코드로 일관 응답합니다.

### 2.9 라이브러리 고정

- Markdown 렌더링은 `react-markdown` + `remark-gfm`을 사용합니다.
- 코드 하이라이트는 `shiki`(웹 워커 기반)로 통일합니다.
- diff는 `diff` 라이브러리로 텍스트 diff를 만들고, 인라인 댓글 매핑은 자체 구현합니다.
- 단위 테스트 러너는 BE/FE 모두 **Vitest**로 통일합니다.
- 타입 검증은 zod, 타입 가드 유틸은 `is`(playbook code-style)를 사용합니다.

### 2.10 보안과 운영

- 환경변수는 워크스페이스별 `.env.local`로 분리합니다(`be/.env.local`, `fe/.env.local`, `worker/.env.local`). fallback 금지, 누락 시 즉시 명확한 에러로 실패합니다.
- 권한은 deny-by-default입니다. NestJS Guard에서 인증·인가를 선검사합니다.
- 외부 LLM 전송 데이터는 분석에 필요한 최소 범위로 제한합니다.
- 모든 BE 응답은 단일 응답 포맷(`success`, `data` 또는 `error`)을 사용합니다.

### 2.11 환경변수 추가 키

각 워크스페이스 `.env.local`에 다음 키를 둡니다. `fe/.env.local`은 `NEXT_PUBLIC_API_BASE_URL`만, `be/.env.local`은 BE/세션/DB/OAuth/LLM 관련 키, `worker/.env.local`은 worker가 직접 읽는 키만 둡니다.

- 인증과 세션.
  - `SESSION_SECRET`.
  - `SESSION_COOKIE_NAME`.
- 외부 URL.
  - `FE_PUBLIC_BASE_URL`.
  - `BE_PUBLIC_BASE_URL`.
- DB와 Redis.
  - `DATABASE_URL`.
  - `REDIS_URL`.
- OAuth.
  - `GOOGLE_OAUTH_CLIENT_ID`.
  - `GOOGLE_OAUTH_CLIENT_SECRET`.
  - `GOOGLE_OAUTH_REDIRECT_URI`.
  - `GITHUB_OAUTH_CLIENT_ID`.
  - `GITHUB_OAUTH_CLIENT_SECRET`.
  - `GITHUB_OAUTH_REDIRECT_URI`.
- LLM.
  - `LLM_API_KEY`.
  - `LLM_MODEL_PROBLEM_ANALYZE`.
  - `LLM_MODEL_SUBMISSION_REVIEW` (AI 코드 리뷰 전용).
  - `LLM_MODEL_TRANSLATION` (코드 번역 전용).
- 이메일.
  - `RESEND_API_KEY` (be 전용). 누락 시 fail-fast. dev fallback(콘솔 출력 등)은 두지 않음.
  - `EMAIL_FROM_ADDRESS` (be 전용).
- 정책.
  - `AI_TOKEN_DEFAULT` (= `100000`).

과거 `API_KEY` 이름은 **`LLM_API_KEY`**로 통일했습니다. 이메일 키(`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`)는 `be/.env.local`에만 둡니다(worker는 BE 큐를 통해 메일 발송 트리거를 받습니다).

### 2.12 그룹·AI·번역·이메일 초대 모델 합의(2026-05-07 2차)

다음은 5/7 2차 회의로 새로 합의된 내용입니다. 기존 §5.6 피드백 공개 정책 매트릭스, 일회성 초대 링크 만료 모델, AI 분석 결과 별도 패널은 모두 폐기합니다.

- 그룹은 공개/비공개 구분 없음. 외부 검색 없음.
- 그룹 코드 1개를 영구로 사용. 8자, 영문 대소문자 + 숫자, 대소문자 구분. 그룹장만 갱신 가능. 갱신 시 이전 코드와 그것으로 만들어진 모든 초대 링크는 즉시 무효화됨. 무효화된 토큰 접근은 `404`.
- 그룹 코드 자체는 그룹원 모두에게 노출. 코드 공유로 가입을 끌어오는 것은 자연스러운 운영. 단 가입 토글이 모두 꺼지면 어떤 코드도 무효화됨.
- 가입 방식 4가지(`코드`, `링크`, `가입 신청`, `이메일 초대`)는 그룹별 토글로 켜고 끔. 모두 끄면 가입 동결.
- 가입 신청은 정원이 가득해도 접수. 승인 시점에 정원이 가득이면 `CONFLICT GROUP_FULL`로 거부.
- 이메일 초대는 그룹당 1시간 내 50건 발송 제한. 같은 주소 PENDING 토큰이 있으면 기존 토큰을 만료 처리한 뒤 새 토큰 발급.
- 그룹 폼 필드: 그룹명(필수, 20자), 그룹 설명(optional, plain text 500자), 최대 인원수(default 10, 한도 50), 그룹 코드 표시 + 코드 갱신(그룹장만), 가입 방식 4 토글, 그룹 규칙 7항목.
- 그룹 규칙 7항목: `useDeadline`, `defaultDeadlineTime`, `allowLateSubmission`, `useAiFeedback`, `translationLanguage`, `allowEditAfterSubmit`, `assignmentCreatorRoles`. 모두 기본값을 가진다.
- 그룹 규칙 변경 시 그룹원에게 알림을 보내지 않는다. 변경은 그룹 설정 화면 자체로 확인.
- 피드백 공개 정책 매트릭스(역할 × 단위 × deadline 전후)는 폐지. 그룹원 모두 공개로 단일화. 과제별 override 매트릭스도 폐지.
- AI 피드백은 GitHub Bot 스타일. AI가 우리 댓글·코드 리뷰 시스템에 사용자처럼 인라인 댓글, `+`/`-` diff 형태의 개선 제안, 제출 단위 요약을 작성한다. 작성자는 단일 시스템 사용자 `AI 튜터`(`is_system_bot=true`).
- AI 코드 리뷰는 자동 트리거 없음. 제출 작성자, 그룹장, 그룹 관리자가 명시적으로 "AI 리뷰 요청"을 눌러야 시작.
- 같은 버전에 AI 리뷰를 여러 번 트리거하면 결과는 누적. 이전 봇 댓글을 자동 삭제하지 않고 작성 시각으로 구분.
- AI 봇 댓글·리뷰 삭제는 그룹장/그룹 관리자만 가능.
- AI 피드백 비활성 그룹에서는 AI 댓글이 만들어지지 않는다. "AI 리뷰 요청" 버튼도 안 보임. 사용자는 키워드 기반 언어 감지 결과를 그대로 쓰고 알고리즘 태그 등 보조 메타는 직접 입력한다.
- 코드 번역은 사용자 트리거. 그룹 규칙 `translationLanguage`로 대상 언어를 정한다. `none`이면 번역 비활성.
- 같은 그룹원이면 누구나 첫 번역을 누를 수 있고, 누른 사람의 토큰을 차감한다. 캐시는 제출 버전 단위. 원본 == 대상 언어이면 토큰 미차감 단순 복사.
- 이메일 초대는 `be/.env.local`에 둔 `RESEND_API_KEY`로 발송. 키 누락 시 fail-fast. dev 모드 fallback은 두지 않는다(키는 사용자가 추후 설정). 1회용 토큰, TTL 7일.
- 문제 URL 분석은 백엔드 또는 worker가 직접 HTTP로 가져와 LLM에 입력. 클라이언트는 직접 fetch하지 않는다. 화면에는 항상 "문제 확인하러 가기" 외부 링크 버튼을 둔다.
- 제출 메타데이터(제목, 알고리즘 태그 등) 수정은 덮어쓰기로 처리하며 새 버전을 만들지 않는다. 코드 본문 수정만 새 버전을 만든다. 댓글·리뷰는 제출 버전에 귀속되며 새 코드 버전이 만들어지면 자동 매핑되지 않는다.
- ERD 변경 영향: `INVITE_LINKS`, `INVITE_CODES`, `GROUP_FEEDBACK_POLICIES`, `ASSIGNMENT_POLICY_OVERRIDES`, `AI_ANALYSES` 폐지. 신규 또는 변경: `GROUPS`(설명/최대 인원/그룹 코드/가입 토글/그룹 규칙 컬럼 추가), `GROUP_INVITE_LINKS`(영구 토큰 모델), `GROUP_EMAIL_INVITES`(1회용 토큰 모델), `SUBMISSION_TRANSLATIONS`(번역 캐시), `AI_REVIEW_RUNS`(AI 코드 리뷰 시도 단위), `COMMENTS`/`REVIEWS`/`REVIEW_REPLIES`(`is_ai_bot`, `ai_review_run_id` 컬럼 추가), `USERS`(`is_system_bot` + `provider='system'`로 `AI 튜터` 단일 봇 사용자 등록).
- AI 토큰 차감 = OpenRouter `usage.total_tokens` 그대로(LLM 응답 입력+출력 합). 실패/타임아웃은 0 차감.
- AI 코드 리뷰 LLM 호출 실패 시 worker 자동 1회 재시도(짧은 backoff). 재시도 실패 시 `FAILED` 기록 + 제출 작성자 1명에게만 실패 알림.
- AI 코드 리뷰 완료/실패 알림 수신자는 제출 작성자 1명(트리거 사용자에게 별도 알림 없음).
- 정원 검사는 별도 row lock 없이 트랜잭션 내 카운트 비교 + unique 제약 충돌 처리. 동시 요청 race는 `CONFLICT GROUP_FULL`로 응답.
- `request` 토글 off일 때 PENDING 가입 신청은 자동 거절하지 않고 유지. 토글 off 동안은 `REJECTED`만 가능, `APPROVED`는 `FORBIDDEN JOIN_DISABLED`. 토글 켜지면 둘 다 가능.
- 문제 URL fetch 실패 시 자동 재시도 없이 즉시 `PROBLEM_ANALYSES.status=FAILED` + 수동 입력 알림.
- AI 튜터 프로필 이미지: 정적 SVG `fe/public/icons/ai-tutor.svg`(AI 로봇 느낌 이모지) 1개를 모든 봇 댓글 작성자 아바타로 사용.

---

## 3. 디자인 시스템과 AppShell 기준

UI 작업은 다음 기준을 따릅니다. 페이지 단위 디자인은 작업자가 결정하되 토큰과 컴포넌트 규칙은 고정합니다.

### 3.1 디자인 토큰

- 컬러는 의미 토큰으로 정의합니다. 예시(추후 실제 코드와 동기화).
  - `--bg`, `--bg-elevated`, `--surface`, `--border`, `--fg`, `--fg-muted`, `--accent`, `--accent-fg`, `--danger`, `--success`, `--warning`, `--info`.
- 라이트/다크는 `:root`와 `[data-theme="dark"]`에서 동일한 토큰 이름을 다른 값으로 정의합니다.
- 간격 토큰 `--space-1` ~ `--space-8`, 라운드 `--radius-sm/md/lg`, 폰트 사이즈 `--text-xs ~ --text-2xl`.
- 컴포넌트 단위 하드코딩 hex/px 사용은 금지합니다.

### 3.2 상태 시각 규칙

- 칩과 배지는 색상만으로 의미를 전달하지 않습니다. 색상 + 텍스트 또는 아이콘을 같이 사용합니다.
- Empty / Loading / Error / Deleted 상태는 공용 컴포넌트로 분리합니다.

### 3.3 SVG 아이콘

- `fe/public/icons.svg`에 `<symbol>`로 정의합니다.
- `viewBox="0 0 24 24"`로 통일합니다.
- 모든 path는 `fill="currentColor"` 또는 `stroke="currentColor"`를 사용합니다.
- 컴포넌트는 `<Icon name="..." size="md" />` 한 가지만 노출합니다.

### 3.4 AppShell

- 데스크탑.
  - 좌측: 그룹 사이드바(현재 그룹, 그룹 내비게이션).
  - 상단: 상단바(검색 입력, 알림 드롭다운, 프로필 메뉴, 테마/언어 토글).
  - 우측 패널: 과제 상세, 제출 상세에서 AI 분석/리뷰 요약을 보여주는 슬롯.
- 모바일.
  - 상단바 + 하단 탭(홈/캘린더/알림/내정보).
  - 좌측 드로어로 그룹 전환.

### 3.5 i18n과 시간

- 기본 한국어, fallback 영어. 두 리소스의 키는 항상 동일.
- 코드, 플랫폼 이름, 알고리즘 태그, 프로그래밍 언어 이름은 번역하지 않습니다.
- 시간은 `timestamptz` UTC 저장, KST 표시. 상대 시간은 KST 기준 계산.

---

## 4. Phase 진행 순서와 의존성

다음 순서로 진행합니다. 각 Phase는 BE 엔티티/엔드포인트 → FE 페이지/컴포넌트 → 단위 테스트 → 검증 명령 → 체크리스트 갱신 순서로 닫습니다.

1. Phase 0 - 기반 정합성과 도구 정비.
2. Phase 1 - DB 스키마와 마이그레이션 1차.
3. Phase 2 - OAuth 완성과 세션 발급.
4. Phase 3 - AppShell과 디자인 시스템 마감.
5. Phase 4 - 그룹과 권한.
6. Phase 5 - 가입 플로우(초대 링크/초대 코드/가입 신청).
7. Phase 6 - 과제와 문제 메타데이터.
8. Phase 7 - 제출과 버전과 diff.
9. Phase 8 - 댓글과 코드 리뷰.
10. Phase 9 - 피드백 공개 정책 엔진.
11. Phase 10 - Worker와 LLM 분석.
12. Phase 11 - 알림(SSE)과 deadline 임박.
13. Phase 12 - 캘린더와 검색.
14. Phase 13 - 공지와 커뮤니티.
15. Phase 14 - E2E와 회귀 점검.

각 Phase의 “완료 정의”는 해당 Phase 끝의 표를 따릅니다.

---

## 5. Phase 0 - 기반 정합성과 도구 정비

### 5.1 진행 방향

- 기존 `pnpm-workspace.yaml` 구조에 `packages/shared`를 추가합니다.
- BE/FE/worker가 모두 같은 룰(eslint, prettier, vitest)을 쓰도록 정합합니다.
- 워크스페이스별 `.env.local`(be/fe/worker)을 새 키 목록으로 정리합니다.
- 잘못 표시된 OAuth 완료 표기를 정정합니다.

### 5.2 BE/FE/worker 공통

- [x] `packages/shared` 워크스페이스 추가. (`packages/shared/package.json`, `tsconfig.json`)
- [x] `packages/shared`에 응답 포맷, 에러 코드, 역할/상태 enum, zod 스키마 베이스 작성.
- [x] `pnpm-workspace.yaml`에 `packages/*` 추가.
- [x] 루트 `package.json`에 공용 스크립트 추가. (`pnpm test`, `pnpm typecheck`, `pnpm lint`)
- [x] eslint + prettier 공용 설정. (BE/FE/worker/shared 동일 규칙)
- [x] Vitest 도입. (BE/FE/worker 각각 `vitest.config.ts`)
- [x] 커버리지 보고 활성화. (BE 70~80%, FE 60%)
- [x] 워크스페이스별 `.env.local` 키 목록 갱신과 누락 키 fail-fast 부트스트랩 함수 작성. (`be/src/config/env.ts`, `fe/src/config/env.ts`)
- [-] `is` 유틸은 도입 보류. typeof 검사로 충분한 단계에서는 표준 검사로 대체. 필요 시 후속 Phase에서 재도입 검토.
- [x] `buildCls`가 FE에 존재함을 확인하고 누락 시 추가. (`fe/src/lib/buildCls.ts` 기존 보존)
- [-] BE Swagger 문서 응답 포맷 동기화는 Phase 2 이후 실제 응답 구조와 함께 정리.
- [x] OAuth 완료 표기 정정. (Phase 2 항목은 §7에서 처음부터 다시 닫기)

### 5.3 인프라

- [x] `docker-compose.yml`에 `redis`, `supabase`(Postgres), `be`, `fe`, `worker` 5개 서비스 구성 확인. (기존 파일 유지)
- [x] `pnpm dev`(루트)에서 `be`, `fe`, `worker`를 동시에 띄우는 스크립트 정리. (`pnpm -r --parallel dev`)
- [-] BE/FE/worker 각 README 업데이트는 후속 Phase 진행 중 보강.

### 5.4 테스트

- [x] `pnpm typecheck`, `pnpm test` 명령이 0개 에러로 통과. (shared 5 tests, worker 1 test)
- [x] `.env.local` 누락 시 worker 부팅이 명확한 에러로 실패하는 테스트.

### 5.5 완료 정의

- 새 워크스페이스 구조와 공용 도구가 동작합니다.
- 누락된 환경변수가 있으면 부팅 단계에서 에러로 실패합니다.
- 잘못 표기됐던 OAuth 완료 항목이 실제 상태와 일치합니다.

---

## 6. Phase 1 - DB 스키마와 마이그레이션 1차

### 6.1 진행 방향

- `design/erd.md`의 모든 엔티티를 TypeORM 엔티티로 1차 작성합니다.
- 1개 마이그레이션으로 초기 스키마를 생성합니다.
- `seed:dev`로 최소 데모 데이터를 만듭니다.

### 6.2 BE

- [x] TypeORM DataSource 구성. (`be/src/config/data-source.ts`)
- [x] `synchronize: false` 강제와 마이그레이션 등록 설정.
- [x] 엔티티 작성. ERD 23개 엔티티 모두 작성(1차). 신 모델 변경 사항은 Phase 4/5/9/10에서 마이그레이션으로 정리합니다.
  - 폐지 대상: `INVITE_LINKS`(만료/한도 모델), `INVITE_CODES`, `GROUP_FEEDBACK_POLICIES`, `ASSIGNMENT_POLICY_OVERRIDES`, `AI_ANALYSES`.
  - 신규 또는 변경 대상: `GROUPS`(설명/최대 인원/그룹 코드/가입 토글/그룹 규칙 컬럼), `GROUP_INVITE_LINKS`(영구 토큰), `GROUP_EMAIL_INVITES`(1회용 토큰), `SUBMISSION_TRANSLATIONS`(번역 캐시), `AI_REVIEW_RUNS`(AI 코드 리뷰 시도), `COMMENTS`/`REVIEWS`/`REVIEW_REPLIES`(`is_ai_bot`, `ai_review_run_id` 컬럼), `USERS`(`is_system_bot` + `provider='system'`).
- [x] 인덱스 정의. (조회 패턴 기준 최소 인덱스, 마이그레이션에 포함)
- [x] 1차 마이그레이션 파일 작성. (`be/migrations/1700000000000-init.ts`)
- [ ] 2차 마이그레이션(2026-05-07 합의 반영). 위 폐지/신규/변경 대상에 대한 단일 마이그레이션 파일 작성. 기존 데이터 없는 로컬에서는 `db:revert` 후 단일 init으로 정리해도 됩니다(개발 한정).
- [x] 마이그레이션 ESM 러너 작성과 실행 검증. (`be/scripts/migrate.ts`)
- [x] 시드 스크립트 작성. (`be/scripts/seed-dev.ts`)
- [x] DB / Redis 헬스체크 엔드포인트. (`GET /api/v1/health/db`, `GET /api/v1/health/redis`)

### 6.3 테스트

- [x] 엔티티 메타데이터 단위 테스트. (각 엔티티 인스턴스 생성 + ENTITIES 등록 확인)
- [x] 마이그레이션 up/down/up 통합 검증. (24 → 1 → 24 테이블 수 확인)
- [x] 시드 스크립트 실행 검증. (사용자 + 그룹 + 멤버 1세트 생성 확인)

### 6.4 완료 정의

- `pnpm --filter be db:migrate` 실행 시 24개 테이블 + migrations 메타테이블이 생성됩니다.
- `pnpm --filter be db:seed` 실행 시 데모 사용자/그룹이 생성되어 다음 Phase 작업이 가능합니다.
- `GET /api/v1/health/db`, `GET /api/v1/health/redis`가 `{success:true,data:{ok:true}}`를 반환합니다.

---

## 7. Phase 2 - OAuth 완성과 세션 발급

### 7.1 진행 방향

- OAuth start → callback token 교환 → DB upsert → Redis 세션 → httpOnly 쿠키 → FE redirect까지 한 번에 연결했습니다.
- 세션은 Redis에 저장하고 httpOnly 쿠키로 전달합니다.
- FE는 서버 컴포넌트에서 세션 쿠키를 전달해 `/me`를 조회하고 로그아웃까지 처리합니다.

### 7.2 BE

- [x] Google OAuth code → token 교환.
- [x] Google userinfo 조회. (`sub`, `email`, `name`, `picture`)
- [x] GitHub OAuth code → token 교환.
- [x] GitHub user/profile 조회. (`id`, `email`, `login/name`, `avatar_url`)
- [x] provider 기준 사용자 upsert. (동일 이메일 다른 provider는 별도 사용자)
- [x] 로그인 시 프로필 이미지 최신 동기화.
- [x] 닉네임 기본값을 provider 표시명으로 설정.
- [x] Redis 세션 저장소 모듈. (`session:{id}` 키)
- [x] 세션 발급 후 httpOnly + SameSite=Lax 쿠키 응답. (`Secure`는 프로덕션 HTTPS 전환 시 활성화 필요)
- [x] OAuth callback 후 FE 진입 페이지로 redirect.
- [x] `GET /api/v1/users/me` 세션 기반 사용자 응답.
- [x] `POST /api/v1/auth/logout` 세션 무효화.
- [x] `DELETE /api/v1/users/me` 탈퇴(해당 OAuth 계정만 영향).
- [x] SameSite=Lax + state 쿠키 검증.
- [-] `RolesGuard`는 그룹 권한 단계(Phase 4)에서 함께 도입.

### 7.3 FE

- [x] OAuth 진입 페이지 디자인 및 구현. (`/login`)
- [x] 로그인 후 홈과 `/me`에서 세션 사용자 상태 표시.
- [x] 닉네임 수정 UI.
- [x] 로그아웃 UI.
- [x] 회원 탈퇴 UI.
- [x] provider 분리 계정 안내 문구. (`/login`)
- [x] 미로그인 시 `/me`는 `/login`으로 redirect.

### 7.4 테스트

- [x] OAuth 서비스 단위 테스트. (`AuthService` mock)
- [x] 세션 저장소 단위 테스트. (`SessionService` redis mock)
- [-] OAuth provider 통합 테스트는 실제 authorization code가 필요해 로컬에서는 수동 브라우저 검증으로 대체.
- [-] 동일 이메일 다른 provider 분리 계정 테스트는 DB 픽스처 기반 통합 테스트로 Phase 4 이후 보강.
- [-] FE 인증 단위 테스트는 AppShell 단계에서 공통 패턴과 함께 보강.

### 7.5 완료 정의

- OAuth start가 provider로 redirect하고 state 쿠키를 발급합니다.
- 비로그인 `GET /api/v1/users/me`는 `401`입니다.
- `pnpm --filter fe build`가 통과합니다.

---

## 8. Phase 3 - AppShell과 디자인 시스템 마감

### 8.1 진행 방향

- 기능 구현 전에 일관된 레이아웃과 토큰을 먼저 고정합니다.
- 모든 페이지는 같은 AppShell 위에서 동작합니다.
- CSS Module + CSS 변수 + SVG 스프라이트 + i18n 리소스를 강제합니다.

### 8.2 FE

- [x] 디자인 토큰 정리. (`fe/app/globals.css` light/dark 변수 분기 보강 - `--color-surface-elevated` 추가)
- [x] 라이트/다크 모드 변수 분기 정합화.
- [x] AppShell 레이아웃 구현. (좌 사이드바 + 상단바 + 우측 액션 슬롯, `fe/src/shell/AppShell.tsx`)
- [x] 모바일 AppShell 구현. (햄버거 + 좌 드로어, `@media (max-width: 960px)`)
- [x] 공용 `Icon` 컴포넌트. (`fe/src/ui/Icon.tsx` + `fe/public/icons/icons.svg` 스프라이트)
- [x] 공용 컴포넌트 1차 정리. (`Button`, `Input`, `Modal`, `Tabs`, `Chip`, `Badge`)
- [x] 상태 컴포넌트. (`EmptyState`, `LoadingState`, `ErrorState`, `DeletedState`)
- [-] 테마 토글 / 언어 토글은 기존 `PreferenceToolbar`를 AppShell의 우측 액션 영역으로 이동했습니다. 프로필 드롭다운은 Phase 4에서 그룹 권한 메뉴와 함께 통합 예정.
- [x] `buildCls` 컨벤션 단위 테스트.
- [x] i18n 키 누락 검사 스크립트. (`fe/scripts/verify-i18n.mjs`)
- [x] TanStack Query Provider 도입. (`fe/src/providers/QueryProvider.tsx`)

### 8.3 BE

- [-] 알림 unread count 베이스 엔드포인트는 Phase 11(알림) 구현 시점으로 이전. AppShell에는 unread prop만 마련.

### 8.4 테스트

- [x] `buildCls`, `Button` 단위 테스트.
- [-] AppShell 시각 회귀 테스트는 Playwright/E2E 단계에서 다룸.
- [x] `pnpm --filter fe test:i18n`으로 ko/en 키 정합성 검증.

### 8.5 완료 정의

- 모든 페이지가 동일 AppShell 안에서 렌더링됩니다. (`/`, `/login`, `/me`, `/groups`, `/assignments`)
- light/dark 모드 토큰이 분기되며 모바일 햄버거 → 드로어 흐름이 동작합니다.
- `pnpm --filter fe build`가 통과합니다.
- [-] 한국어/영어 텍스트 overflow 회귀 테스트는 E2E 단계로 이전.
- [x] 공용 컴포넌트 variant 토글 단위 테스트. (Button)
- [-] hydration mismatch 회귀 테스트는 E2E/Playwright 단계로 이전.



---

## 9. Phase 4 - 그룹과 권한 (2차 합의로 재정의)

### 9.1 진행 방향

- 그룹은 공개/비공개 구분이 없습니다. 외부 검색도 없습니다.
- 역할은 `OWNER / MANAGER / MEMBER` 3단계입니다.
- 그룹장 1명 정책과 위임을 보장합니다.
- 그룹은 그룹명/그룹 설명/최대 인원수/그룹 코드/가입 방식 4 토글/그룹 규칙 7 항목을 보유합니다.
- 기존에 `[x]`로 닫혀 있던 항목 중 그룹명만 다루던 부분은 새 모델 마이그레이션 후 다시 검증합니다(아래 작업 항목 참고).

### 9.2 BE

- [x] `POST /api/v1/groups` 그룹 생성. (`description`, `maxMembers`, 가입 토글·규칙 평탄 필드 + 응답에 `groupCode`)
- [x] `GET /api/v1/groups` 내가 속한 그룹 목록. (`description`, `maxMembers`, `memberCount` 등)
- [x] `GET /api/v1/groups/:groupId` 그룹 상세. (그룹 메타 + `groupCode`·`joinMethods`·규칙)
- [x] `PATCH /api/v1/groups/:groupId` 그룹 메타 수정. (평탄 필드 부분 업데이트 + `maxMembers` 하한 검증)
- [x] `POST /api/v1/groups/:groupId/code/regenerate` 그룹 코드 갱신. (그룹장만, 이전 코드 무효화 + `GROUP_INVITE_LINKS` 일괄 `revoked_at`)
- [x] 그룹 상세 응답에 `groupCode`를 그룹원 모두에게 노출.
- [x] `DELETE /api/v1/groups/:groupId` 그룹 삭제. (그룹명 입력 확인, 그룹장만)
- [x] `GET /api/v1/groups/:groupId/members` 멤버 목록.
- [x] `PATCH /api/v1/groups/:groupId/members/:userId/role` 역할 변경.
- [x] `DELETE /api/v1/groups/:groupId/members/:userId` 강퇴.
- [x] `DELETE /api/v1/groups/:groupId/members/me` 자진 탈퇴.
- [x] 그룹장 위임 API.
- [x] 그룹 삭제 시 연관 데이터 실삭제 트랜잭션. (`GROUP_INVITE_LINKS`, `GROUP_EMAIL_INVITES` 포함. 번역·AI 리뷰 런 등 후속 테이블은 해당 Phase에서 추가 검증)
- [x] 알림 데이터는 그룹 삭제와 무관하게 보존하는 정책 반영.
- [-] 권한 가드와 에러 응답 일관화. (`canPerform` 단일 함수 + `AuthGuard`. 신 모델: `assignmentCreatorRoles` 등 그룹 규칙 기반 분기 추가 필요)

### 9.3 FE

- [x] 그룹 카드 그리드 화면 폐기. `/groups`는 화면을 그리지 않고 서버에서 즉시 `redirect`합니다(가입 그룹 0개면 `/groups/explore`, 그 외엔 `psstudio_last_group` 쿠키 → 첫 그룹). 카드 그리드를 다시 만들지 않습니다.
- [x] 그룹 둘러보기 화면(`/groups/explore`). “새 그룹 만들기” + “초대 코드로 가입” 두 카드. 외부 그룹 검색은 두지 않음.
- [x] 그룹 추가 모달(`AddGroupModal`). 그룹 상세 헤더의 “그룹 추가” 버튼에서 오픈. 새 그룹 만들기와 초대 코드 가입을 한 모달에서 분기.
- [x] 그룹 상세 헤더 액션. `AppShell.actions` 슬롯에 “그룹 추가”(primary) + “그룹 둘러보기”(secondary) 두 버튼을 같은 크기로 배치.
- [x] 그룹 상세 진입 시 마지막 접근 그룹 추적. `psstudio_last_group` 쿠키(`SameSite=Lax`, max-age 약 400일) + `localStorage("psstudio:lastGroupId")` 동시 갱신.
- [x] `GET /api/v1/groups` 응답에 `memberPreviews` 4명 추가. (FE 카드 그리드는 폐기됐지만 향후 다른 사용처를 위해 BE/타입은 유지)
- [x] 그룹 생성 페이지(`/groups/new`). 그룹명/설명/최대 인원수/가입 방식 4 토글/그룹 규칙 7 항목 폼. 헤더 인라인 생성 폼 제거. 모든 라벨/캡션을 `t()` 키로 i18n.
- [-] 그룹 상세 대시보드. (그룹 코드·초대 관리 진입은 반영. 설정 탭의 전체 메타 수정 폼은 아래 `그룹 설정 화면` 항목에서 마무리)
- [x] 그룹 설정 화면. 신 모델 폼(그룹명/설명/최대 인원/가입 토글 4종/그룹 규칙 7항목 + 그룹 코드 갱신 모달). (`GroupDetailClient` 설정 탭 확장)
- [x] 멤버 관리 테이블과 역할 변경 UI.
- [x] 강퇴/탈퇴/그룹장 위임 UI.
- [-] 그룹 삭제 확인 UI. (그룹명 입력 + 복구 불가 경고는 1차 완료. 추가로 그룹 코드 갱신 모달은 위 설정 화면 항목에 포함)
- [-] 사이드바의 현재 그룹 전환 UI는 Phase 11(공지/대시보드)과 함께 마무리.

### 9.4 테스트

- [x] 권한별 접근 제어 단위 테스트(OWNER / MANAGER / MEMBER). (`permissions.spec.ts`)
- [x] 그룹장 자진 탈퇴 금지 테스트. (`groups.service.spec.ts`)
- [x] 그룹 삭제 시 연관 데이터 실삭제 통합 테스트(1차 모델 기준). 신 모델 추가 항목은 마이그레이션 후 재검증.
- [ ] 그룹 코드 갱신 시 이전 코드/링크가 모두 `404`로 응답하는 테스트.
- [ ] 그룹 코드 갱신 권한이 그룹장에게만 허용되는 테스트(그룹 관리자 호출 시 `FORBIDDEN`).
- [ ] `maxMembers`가 현재 멤버 수보다 작게 설정 시 `VALIDATION_ERROR` 테스트.
- [ ] 가입 방식 4 토글이 모두 꺼졌을 때 어떤 가입 API도 `FORBIDDEN`을 응답하는 테스트.
- [ ] `groupCode`가 일반 그룹원 응답에도 포함되는 테스트.
- [-] 그룹 삭제 후 알림 잔존 테스트는 Phase 11 알림 도입 시 함께 검증.
- [-] 그룹 설정 / 멤버 관리 화면 desktop / mobile 시각 검증은 Phase 14에서 자동화 추가.

### 9.5 완료 정의

- OWNER가 그룹 생성과 삭제를 끝까지 수행할 수 있고, 그룹 코드/설명/최대 인원/가입 방식 토글/그룹 규칙을 모두 설정할 수 있습니다.
- MANAGER가 멤버 관리(강퇴/역할 변경)와 가입 방식 토글/그룹 규칙 수정을 수행할 수 있습니다.
- MEMBER가 자진 탈퇴를 할 수 있습니다.
- 그룹 코드 갱신 시 이전 토큰이 모두 무효화되어 `404`로 응답합니다.

---

## 10. Phase 5 - 가입 플로우 (2차 합의로 재정의: 영구 그룹 코드 + 영구 초대 링크 + 가입 신청 + 이메일 초대)

### 10.1 진행 방향

- 가입 경로 4가지(`코드`, `링크`, `가입 신청`, `이메일 초대`)를 모두 지원합니다.
- 그룹 코드는 그룹당 1개, 영구. 8자, 영문 대소문자+숫자, 대소문자 구분.
- 그룹 코드 갱신 시 이전 코드와 그것으로 만든 모든 초대 링크는 즉시 무효화(`revoked_at`).
- 초대 링크는 영구 토큰. 만료 시각/최대 사용 횟수 같은 일회성 모델은 두지 않습니다.
- 이메일 초대는 1회용 토큰. TTL 7일. 1회 사용 후 만료. Resend로 발송.
- 4 토글 중 하나라도 꺼지면 해당 경로의 가입 API는 `FORBIDDEN JOIN_DISABLED`로 차단됩니다. 모두 꺼지면 가입 동결.
- 1차 회의에서 닫혔던 invite-links 만료/사용 횟수 모델 + invite-codes 관리자 조회/regenerate API는 모두 폐기됩니다. 신 모델로 다시 만듭니다.

### 10.2 BE

- [x] (구) 만료·한도 중심 초대 링크 모델 폐기. 영구 토큰 `GROUP_INVITE_LINKS`로 교체.
- [x] 코드 갱신은 `POST /api/v1/groups/:groupId/code/regenerate` 단일 엔드포인트(조회 보조용 `GET .../invite-code`는 유지 가능).
- [x] `POST /api/v1/invites/links/:token/accept` 폐기 → `POST /api/v1/invites/link/:token/accept`, 코드 가입은 `POST /api/v1/invites/code/accept`.
- [x] `GET /api/v1/invites/preview?code=|link=|emailToken=` 진입 메타 응답.
- [x] `POST /api/v1/invites/code/accept` 그룹 코드로 가입(가입 토글 검사 + 가득 검사 + `404 GROUP_CODE_INVALID`).
- [x] `POST /api/v1/groups/:groupId/invite-links` 영구 링크 발급(만료 없음).
- [x] `GET /api/v1/groups/:groupId/invite-links` 활성 링크 목록.
- [x] `DELETE /api/v1/groups/:groupId/invite-links/:linkId` 개별 무효화.
- [x] `POST /api/v1/invites/link/:token/accept` 링크 가입.
- [x] `POST /api/v1/groups/:groupId/email-invites` 배치 이메일 초대 발송(Resend). 그룹당 1시간 50건 rate limit. 같은 주소 PENDING 토큰이 있으면 만료 후 재발급.
- [x] `GET /api/v1/groups/:groupId/email-invites` 발송 목록.
- [x] `DELETE /api/v1/groups/:groupId/email-invites/:inviteId` 즉시 만료.
- [x] `POST /api/v1/invites/email/:token/accept` 이메일 토큰 수락(미인증이면 FE에서 `/login?next=...` 처리).
- [-] 가입 신청 API 4종(생성/목록/승인/거절) — 1차 완료. 신 모델에서 추가/변경.
  - [ ] `joinMethods.request`가 `false`이면 신청 생성 `FORBIDDEN JOIN_DISABLED`.
  - [ ] 정원 가득해도 신청 생성은 허용.
  - [ ] 승인 시점에 정원 재검사. 가득이면 `CONFLICT GROUP_FULL`로 거부하고 `PENDING` 유지.
  - [ ] `request` 토글 off일 때 결정 API: `APPROVED`는 `FORBIDDEN JOIN_DISABLED`, `REJECTED`는 허용.
  - [ ] 토글 off 시 기존 PENDING은 자동 거절하지 않음(자연 보존).
- [-] 가입 결과 알림 생성 훅은 Phase 11에서 실제 발송과 함께 wiring.

### 10.3 FE

- [x] (구) 초대 링크 생성 UI(만료 시각/최대 사용 횟수) 폐기. 영구 링크 발급 UI로 교체(`/groups/.../invite`).
- [-] (구) `/join-by-code` 단일 페이지. 신 모델 코드 입력은 `AddGroupModal`과 `/groups/explore` 양쪽에 통합됨. `/join-by-code` 라우트는 외부 링크 호환을 위해 잠정 유지 중. 토큰 자동 인식 단일 페이지로 통합 후 라우트 정리 예정.
- [x] `/groups/[groupId]/invite`에 그룹 코드 노출, 코드 재발급, 영구 링크 목록·발급·무효화 UI.
- [x] 이메일 초대 발송 폼(주소 배치) + 활성 토큰 목록·즉시 만료 UI(동일 페이지 탭).
- [-] 그룹 진입 페이지 단일화. 코드 입력, 링크 토큰 자동 인식, 이메일 토큰 자동 인식. 인증되지 않았으면 `/login?next=...`. 현재는 `/invite/[token]`, `/invite/email/[token]`, `/join-by-code`가 분리되어 있으므로 단일 페이지로 합치는 작업이 남았습니다.
- [ ] 가입 신청 버튼은 그룹 상세 진입 시 `joinMethods.request`가 `true`일 때만 노출.
- [-] 가입 신청 승인/거절 관리 UI는 1차 완료. 신 모델 응답 변경 시 반영.

### 10.4 테스트

- [-] (구) 초대 링크 만료/횟수 테스트는 폐기. 신 모델은 `revoked_at` 유무로만 검증.
- [ ] 그룹 코드 갱신 시 이전 코드 입력 시도 `404 GROUP_CODE_INVALID` 응답.
- [ ] 영구 링크 발급 후 `revoke` 시 `404 GROUP_CODE_INVALID`.
- [ ] 가입 토글 4개 각각 off일 때 해당 가입 API가 `FORBIDDEN JOIN_DISABLED`.
- [ ] 그룹 가득 시 가입(코드/링크/이메일) `CONFLICT GROUP_FULL`.
- [ ] 정원 가득 상태에서도 가입 신청 접수 후 승인 시점에 거부되는 테스트.
- [ ] `request` 토글 off일 때 PENDING 결정: `APPROVED`는 거부, `REJECTED`는 허용 테스트.
- [ ] 이메일 초대 토큰 만료/사용됨 시 `404 INVITE_EXPIRED`.
- [ ] 이메일 초대 1시간 50건 초과 시 `RATE_LIMITED` 테스트.
- [ ] 같은 주소에 PENDING 토큰이 있을 때 재발송 시 기존 토큰이 만료 처리되고 새 토큰이 발급되는 테스트.
- [ ] 동일 사용자가 같은 그룹에 중복 가입 시도 처리 테스트(기존 유지).

### 10.5 완료 정의

- 4가지 경로 모두로 새 사용자가 그룹원이 됩니다(허용 토글 켜진 경우).
- 무효화/만료된 토큰은 모두 `404`로 차단됩니다.
- 이메일 초대를 누른 미가입자는 OAuth 로그인 후 자동으로 그룹에 합류합니다.

---

## 11. Phase 6 - 과제와 문제 메타데이터

### 11.1 진행 방향

- 과제는 문제 1개만 가집니다.
- 문제 본문은 저장/표시하지 않습니다. 메타데이터만 저장합니다.
- 지원 플랫폼 파싱(BOJ/Programmers/LeetCode) + 미지원 URL은 `기타`.

### 11.2 BE

- [x] `POST /api/v1/groups/:groupId/assignments` 과제 생성.
- [x] `GET /api/v1/groups/:groupId/assignments` 과제 목록.
- [x] `GET /api/v1/assignments/:id` 과제 상세. (그룹 prefix 없이 단일 ID 라우트로 단순화)
- [x] `PATCH /api/v1/assignments/:id` 과제 수정.
- [x] `DELETE /api/v1/assignments/:id` 과제 삭제. (`confirmTitle` 일치 필수)
- [x] 과제 설명 plain text 검증. (Markdown 비허용 — `text` 필드, 200자/2000자 제한)
- [x] 문제 URL 검증과 플랫폼 파서. (BOJ/Programmers/LeetCode)
- [x] 미지원 URL `기타` 정책.
- [-] deadline KST 23:59 기본값은 FE 입력 단계에서만 안내. UTC 저장은 BE.
- [x] 지각 제출 표시 정책 반영. (`isLate`)
- [x] 과제 삭제 시 제출/댓글/리뷰/AI 결과 동시 실삭제.
- [x] 삭제 영향 카운트 스냅샷 API. (`GET /api/v1/assignments/:id/deletion-impact`)
- [x] 과제 생성/URL 변경 시 큐 enqueue hook. (실제 분석은 Phase 10)

### 11.3 FE

- [x] 과제 생성 화면. (`/groups/[groupId]/assignments/new`)
- [x] 과제 수정 화면. (`/groups/[groupId]/assignments/[id]/settings`)
- [x] 과제 상세 화면(문제 본문 표시 금지, 외부 링크만 노출).
- [-] 문제 분석 실행 UI는 Phase 10에서 분석 결과와 함께 노출. 메타데이터 수정 UI는 활성화.
- [x] 문제 메타데이터 표시 UI. (제목/난이도/플랫폼/태그)
- [x] 과제 제목 자동 채움 + 수정 UI.
- [x] 과제 설명 plain text 입력 UI.
- [x] deadline 날짜·시각 입력 UI. (KST 표시 + `datetime-local`)
- [x] 과제 삭제 확인 UI(영향 카운트 표시).

### 11.4 테스트

- [x] 플랫폼 파서 단위 테스트. (BOJ/Programmers/LeetCode/`기타` — `problem-parser.spec.ts`)
- [-] deadline 시간대 단위 테스트는 Phase 11(캘린더) 통합 시 함께 보강.
- [-] 지각 표시 단위 테스트는 통합 테스트 안에서 자연 검증되나 별도 fixture로 Phase 14 보강 예정.
- [x] 과제 삭제 연관 데이터 동시 삭제 트랜잭션 검증. (`assignments.service.spec.ts`)
- [-] 문제 본문 미표시 회귀 검증은 Phase 14 자동화에서 시각 회귀로 합산.

### 11.5 완료 정의

- OWNER/MANAGER가 과제를 생성·수정·삭제할 수 있습니다.
- 그룹원이 과제 상세에서 문제 링크와 메타데이터를 확인할 수 있습니다.

---

## 12. Phase 7 - 제출과 버전과 diff

### 12.1 진행 방향

- 한 사용자가 같은 과제에 여러 번 제출 가능합니다.
- 제출 안에서 코드 수정은 새 버전으로 누적합니다.
- 언어 변경은 별도 제출로 분리합니다.

### 12.2 BE

- [x] `POST /api/v1/assignments/:assignmentId/submissions` 제출 생성.
- [x] `GET /api/v1/assignments/:assignmentId/submissions` 목록(정렬/필터).
- [x] `GET /api/v1/submissions/:submissionId` 제출 상세.
- [x] `PATCH /api/v1/submissions/:submissionId/code` 제출 코드 수정(버전 증가).
- [x] `PATCH /api/v1/submissions/:submissionId/title` 제출 제목 변경.
- [x] `DELETE /api/v1/submissions/:submissionId` 실삭제(연관 댓글/리뷰 동시 삭제).
- [x] `GET /api/v1/submissions/:submissionId/versions/:versionNo` 버전별 코드 조회. (목록은 상세 응답에 포함)
- [x] `GET /api/v1/submissions/:submissionId/diff?from&to` diff 조회 + DB 캐시.
- [x] 코드 길이 200KB 검증.
- [x] 언어 변경 별도 제출 생성 정책 반영. (수정 시 동일 언어만 허용)
- [x] 지각 제출 표시 자동 계산.
- [x] 제출 후 AI 분석 큐 enqueue hook. (실제 처리 Phase 10)
- [x] 키워드 기반 언어 감지 유틸. (`detect-language.ts` BE + 동일한 룰 FE `detect.ts`)

### 12.3 FE

- [x] 코드 제출 화면.
- [x] 텍스트 붙여넣기 전용 입력 UI. (`textarea`)
- [x] 200KB 초과 입력 차단 UI.
- [x] 키워드 기반 언어 감지 + shiki 하이라이트. (`CodeViewer`)
- [x] 언어 수동 변경 UI. (`select`)
- [x] 제출 이름 기본값(`작성자명 + 의 풀이 #N`) + 수정 UI.
- [x] 제출 목록 UI(오래된 순 기본 + 최신 순 토글).
- [-] 제출 필터 UI(사용자/언어/지각)는 BE 쿼리는 동작. FE 패널은 Phase 14에서 보강.
- [x] 제출 상세 UI(메타 + 코드 뷰어).
- [x] 제출 버전 목록 UI.
- [x] diff 화면. (`+++/---` patch 형식 표시. 인라인 댓글 슬롯은 Phase 8.)

### 12.4 테스트

- [x] 코드 길이 제한 테스트. (`submissions.service.spec.ts`)
- [x] 버전 증가 테스트.
- [x] diff 결과 정확성 + 캐시 테스트.
- [x] 언어 변경 별도 제출 분리 테스트.
- [-] 지각 표시 테스트는 통합 시나리오에서 검증되며 Phase 14 자동화에서 별도 fixture 추가.
- [-] 제출 / 상세 / diff 화면 desktop / mobile 시각 회귀는 Phase 14에서 자동화.

### 12.5 완료 정의

- 그룹원이 코드 제출과 수정을 자유롭게 수행하고 버전 diff를 확인할 수 있습니다.

---

## 13. Phase 8 - 댓글과 코드 리뷰

### 13.1 진행 방향

- 과제 댓글, 제출 댓글, 코드 리뷰(라인/범위/파일/제출 단위)를 모두 지원합니다.
- 새 버전에 이전 라인 리뷰는 매핑하지 않습니다.
- 작성자 삭제는 실삭제, 관리자 삭제는 본문 대체.

### 13.2 BE

- [ ] 과제 댓글 CRUD.
- [ ] 제출 댓글 CRUD.
- [ ] 코드 리뷰 생성. (`LINE / RANGE / FILE / SUBMISSION`)
- [ ] 리뷰 답글.
- [ ] 리뷰 `submission_version_id` 귀속.
- [ ] 스레드 오래된 순 정렬.
- [ ] 작성자 삭제(실삭제) 구현.
- [ ] 관리자 삭제(`삭제된 댓글입니다` 대체, 작성자/시각/답글 보존) 구현.
- [ ] AI 봇이 작성한 댓글·리뷰의 `is_ai_bot=true`, `ai_review_run_id` 응답 필드 노출.
- [ ] AI 봇 댓글·리뷰 삭제는 그룹장/그룹 관리자만 가능.
- [ ] 멘션 파서. (같은 그룹원만 허용, 알림 트리거는 Phase 11. AI 봇 본인 멘션은 알림 발생하지 않음)
- [ ] 댓글/리뷰 알림 이벤트 발행 훅(작성자가 AI 봇이어도 동일 이벤트 발행).
- [x] 코드 리뷰 답글 API (`/reviews/:reviewId/replies`) 구현.
- [x] 제출/과제 댓글 답글 API (`/comments/:parentCommentId/replies`) 구현.
- [x] `REACTIONS` polymorphic 테이블 + 마이그레이션.
- [x] 이모지 반응 API (`/reactions` POST/DELETE) 구현.
- [x] 리뷰/답글/댓글 응답 DTO에 `reactions` 인라인 포함.

### 13.3 FE

- [ ] 과제 댓글 UI.
- [ ] 제출 댓글 UI.
- [ ] 코드 라인/범위 선택 리뷰 UI.
- [ ] 파일 전체/제출 전체 리뷰 UI.
- [ ] 일반 댓글과 코드 라인 리뷰 공통 입력 UI.
- [ ] 리뷰 답글 UI.
- [ ] 관리자 삭제 표시 UI.
- [ ] 작성자 삭제(실삭제) 반영.
- [ ] 멘션 입력 UI(같은 그룹원 자동완성).
- [ ] 버전별 리뷰 분리 표시 UI.
- [x] GitHub 스타일 댓글 카드 컴포넌트 (`CommentCard`, `ReactionBar`, `EmojiPicker`).
- [x] diff 페이지 인라인 박스 → 카드 + 답글 + 이모지 리팩토링.
- [x] 제출 상세 본문 댓글에도 `CommentCard`(답글/이모지) 통합.
- [x] 다중 라인 범위 리뷰 행 배경 음영(primary tint) 처리(세로 strip 없이 음영만).
- [x] diff 인라인 리뷰 카드 접기/펼치기(접힘 시 작성자 아바타 칩 + `+N`).
- [x] 마크다운 fenced code block shiki syntax highlight (`MarkdownCodeBlock`).

### 13.4 테스트

- [ ] 리뷰 타입별 생성 단위 테스트.
- [ ] 버전별 리뷰 분리 단위 테스트.
- [ ] 관리자 삭제 정책 단위 테스트.
- [ ] 멘션 대상 제한 단위 테스트.
- [ ] 코드 리뷰 UI 키보드 접근성 검증.
- [ ] 리뷰 스레드 desktop / mobile 시각 검증.

### 13.5 완료 정의

- 그룹원이 제출에 라인 단위 리뷰를 남기고 멘션이 동작합니다.
- 관리자 삭제 본문 대체와 작성자 삭제 실삭제가 명확히 구분됩니다.

---

## 14. Phase 9 - 그룹 규칙 단일화 + 코드 번역 (2차 합의로 재정의)

### 14.1 진행 방향

- 피드백 공개 정책 매트릭스(역할 × 단위 × deadline 전후) + 과제별 override는 폐기됐습니다. 그룹원 모두 공개로 단일화되었으므로 별도 정책 엔진을 만들지 않습니다.
- 대신 그룹 규칙 7항목(`useDeadline`, `defaultDeadlineTime`, `allowLateSubmission`, `useAiFeedback`, `translationLanguage`, `allowEditAfterSubmit`, `assignmentCreatorRoles`)을 단일 source로 적용합니다.
- 코드 번역 기능을 본 Phase에서 같이 닫습니다(그룹 규칙 `translationLanguage`로 통제됨).

### 14.2 BE

- [ ] 그룹 규칙 적용 단일 함수(`canCreateAssignment(groupRules, actorRole)`, `canEditSubmissionCode(groupRules, isAuthor, ...)`, `canPostLateSubmission(...)`, `canRunTranslation(...)` 등).
- [ ] 과제 생성 시 `assignmentCreatorRoles` 검사.
- [ ] 제출 코드 수정 시 `allowEditAfterSubmit` 검사.
- [ ] 제출 메타데이터(제목/태그) 수정 API는 항상 허용(덮어쓰기, 새 버전 미생성).
- [ ] 그룹 규칙 변경은 기존 과제에 소급되지 않고 새 과제부터 반영(과제는 자체 `allow_late_submission` 컬럼을 사용).
- [ ] 코드 번역 API.
  - [ ] `POST /api/v1/submissions/:id/translations`.
  - [ ] `GET /api/v1/submissions/:id/translations`.
  - [ ] `GET /api/v1/submissions/:id/versions/:versionNo/translation`.
- [ ] 번역 트리거 권한: 같은 그룹의 모든 멤버. 누른 사람의 토큰을 차감(차감량 = OpenRouter `usage.total_tokens` 그대로, 실패/타임아웃은 0 차감).
- [ ] `SUBMISSION_TRANSLATIONS` 캐시 hit/miss 처리, 원본 == 대상 언어 시 `is_copy=true`로 토큰 미차감.
- [ ] LLM 호출은 `LLM_MODEL_TRANSLATION` 모델로 분리.

### 14.3 FE

- [ ] 그룹 생성/수정 폼의 그룹 규칙 7항목 입력 컨트롤.
- [ ] 과제 생성 폼에서 `useDeadline=false`이면 마감일 입력 비활성화.
- [ ] 과제 생성 폼에서 `defaultDeadlineTime`을 기본값으로 prefill.
- [ ] 제출 화면에서 `allowEditAfterSubmit=false`이면 코드 수정 버튼 비활성화 + 메타 수정만 허용.
- [ ] 제출 상세에 "번역 보기" 버튼. 그룹 규칙 `translationLanguage=none`이면 노출 안 함.
- [ ] 번역 결과 + 토큰 차감 안내 + 캐시 hit 표시.

### 14.4 테스트

- [ ] `assignmentCreatorRoles` 분기 단위 테스트(OWNER_ONLY / OWNER_AND_MANAGER).
- [ ] `allowEditAfterSubmit=false` 시 코드 수정 거부 테스트.
- [ ] 메타 수정은 항상 허용되며 새 버전을 만들지 않는 테스트.
- [ ] 번역 캐시 hit/miss/원본==대상 언어 케이스 단위 테스트.
- [ ] 그룹 규칙 변경이 기존 과제에 소급되지 않는 테스트.
- [ ] 그룹원 모두가 같은 그룹의 모든 제출/댓글/리뷰를 조회할 수 있다는 권한 테스트(역할 × deadline 전후 매트릭스 없음).

### 14.5 완료 정의

- 그룹 규칙으로만 과제 생성 가능 역할, 마감일 사용 여부, 지각 허용, AI 피드백, 번역, 제출 후 수정이 모두 통제됩니다.
- 번역 캐시가 제출 버전 단위로 동작하고 원본 == 대상 언어 케이스에서 토큰을 차감하지 않습니다.
- 같은 그룹원은 누구나 같은 그룹의 모든 제출/댓글/리뷰/번역 결과를 조회할 수 있습니다.

---

## 15. Phase 10 - Worker, AI 코드 리뷰(GitHub Bot 흐름), 문제 분석 (2차 합의로 재정의)

### 15.1 진행 방향

- Worker는 BullMQ consumer로 동작합니다.
- AI 코드 리뷰는 별도 패널에 결과를 보여주지 않습니다. AI 봇이 우리 댓글·코드 리뷰 시스템에 사용자처럼 글을 직접 작성합니다.
- 문제 URL 분석은 백엔드 또는 worker가 직접 HTTP로 가져와 LLM에 입력합니다.
- LLM 호출은 OpenRouter로 단일화하고, 모델은 기능별로 환경변수로 분리합니다.

### 15.2 Worker / BE

- [ ] BullMQ 큐 정의(`problem.analyze`, `ai.code-review`, `email.send`, `notify.deadline-soon`, `notify.fanout`).
- [ ] Worker 부트스트랩 및 graceful shutdown.
- [ ] OpenRouter 클라이언트 모듈(모델별 환경변수 분리: `LLM_MODEL_PROBLEM_ANALYZE`, `LLM_MODEL_SUBMISSION_REVIEW`, `LLM_MODEL_TRANSLATION`).
- [ ] 시스템 사용자(`provider='system'` + `is_system_bot=true`) 시드와 단일 AI 봇 사용자 `AI 튜터` 보장. 닉네임 `AI 튜터`, 프로필 이미지 = 정적 SVG `fe/public/icons/ai-tutor.svg`(AI 로봇 느낌 이모지).
- [ ] 프롬프트 템플릿 파일 구조(기능별 yaml 또는 ts).
- [ ] 문제 분석 작업.
  - [ ] 백엔드/worker에서 `problem_url` HTML을 직접 fetch.
  - [ ] LLM에 HTML + URL 입력 → 제목/플랫폼/난이도/알고리즘 태그 추론.
  - [ ] `PROBLEM_ANALYSES` 저장 + `ASSIGNMENTS` 메타 머지.
  - [ ] 실패 시 사용자 직접 입력 fallback UI 트리거.
- [ ] AI 코드 리뷰 작업.
  - [ ] 자동 트리거 없음. `POST /submissions/:id/ai-review`로만 발행.
  - [ ] 트리거 권한: 제출 작성자, 그룹장, 그룹 관리자.
  - [ ] 같은 버전에 `RUNNING` run이 있으면 `CONFLICT`로 중복 트리거 거부.
  - [ ] `AI_REVIEW_RUNS` 행을 `PENDING/RUNNING/DONE/FAILED`로 관리.
  - [ ] LLM 응답을 우리 시스템에 등록.
    - [ ] 인라인 라인/범위 리뷰 → `REVIEWS` (`is_ai_bot=true`, `ai_review_run_id`).
    - [ ] `+`/`-` diff 형태 개선 제안 코드 블록을 본문에 포함.
    - [ ] 제출 단위 요약 → `COMMENTS` (`is_ai_bot=true`).
  - [ ] 댓글 작성자는 단일 시스템 AI 봇 `AI 튜터`.
  - [ ] 그룹 규칙 `useAiFeedback=false`인 그룹의 작업은 큐 단계에서 거부.
  - [ ] 같은 버전 재실행 시 이전 봇 댓글을 자동 삭제하지 않고 누적. 작성 시각으로 구분.
  - [ ] AI 봇 댓글·리뷰 삭제는 그룹장/그룹 관리자만 가능(`is_ai_bot=true`인 행에 대한 권한 체크).
  - [ ] 결과 댓글이 등록된 경우에만 토큰 차감. 차감량 = OpenRouter `usage.total_tokens` 그대로. 실패/타임아웃은 0 차감.
  - [ ] LLM 호출 실패 시 worker 자동 1회 재시도(짧은 backoff). 재시도까지 실패하면 `FAILED` 기록.
  - [ ] 완료/실패 알림은 제출 작성자 1명에게만 발송.
- [ ] 토큰 부족 시 `INSUFFICIENT_AI_TOKENS`로 차단.
- [ ] 분석 실패 시: 자동 재시도 없이 즉시 `PROBLEM_ANALYSES.status=FAILED` + 사용자에게 수동 입력 안내 알림.
- [ ] AI 리뷰 실패 시: 자동 1회 재시도 후에도 실패하면 제출 작성자에게 실패 알림.
- [ ] 사용자 토큰 잔액 모델과 관리자 충전 API.
- [ ] 과제 집단 코드 비교 분석(`design.md` 5.4.5, `api-spec.md` 11.3).
  - [x] 집단 번들 `regions` 정책(제출당 1~5·교차 `roleId` 집합 일치·12줄+ 시 구역 최소 2줄·`whole_file` 금지) 및 리포트 발췌-only 프롬프트(`cohort-analysis-bundle.ts`, `assignment-cohort-analysis.service.ts`).
  - [ ] 큐 job(가칭 `assignment.cohort-analysis`) + worker consumer. (1차: Nest 백그라운드 Promise로 대체)
  - [x] `ASSIGNMENT_COHORT_ANALYSES`, `ASSIGNMENT_COHORT_ANALYSIS_MEMBERS` 마이그레이션 및 과제 삭제 시 cascade.
  - [x] `POST/GET /assignments/:assignmentId/cohort-analysis`(경로는 OpenAPI에 맞춤).
  - [x] 마감 전·제출 2 미만·`translationLanguage=none`·동시 `RUNNING` 등 거절 규칙. 과제당 `DONE` 1회만.
  - [x] 성공 전 재시도 시 최신 유효 제출 집합 재수집, 성공 시 버전 스냅샷 기록.
  - [x] 모델명·프롬프트 버전·시드 등 메타 **비저장**(DB·응답; 별도 관측 로그 미추가).
  - [ ] 정적 분석 기반 데드 코드 표시 데이터 생성(상호 diff 판단과 분리). (1차: `deadSpansBySubmission` 빈 배열)

### 15.3 FE

- [ ] 문제 분석 실행 UI(OWNER/MANAGER만 노출).
- [ ] 문제 분석 재실행 UI.
- [ ] 과제/제출 화면에 항상 노출되는 "문제 확인하러 가기" 외부 링크 버튼.
- [ ] 제출 화면에서 "AI 리뷰 요청" 버튼(작성자/그룹장/그룹 관리자만 노출, `useAiFeedback=true`일 때만). 이미 `RUNNING` 상태이면 비활성화.
- [ ] AI 봇 댓글·리뷰가 일반 댓글과 같은 자리에 섞여 보이는 UI(작성자 라벨 `AI 튜터` + 봇 배지).
- [ ] 같은 버전에 누적된 봇 댓글이 시간순으로 잘 표시되는지 확인.
- [ ] AI 봇 댓글의 본문에 포함된 `+`/`-` diff 코드 블록 렌더링.
- [ ] AI 봇 댓글 삭제 버튼은 그룹장/그룹 관리자에게만 노출.
- [ ] AI 코드 리뷰 진행 상태 UI(`AI_REVIEW_RUNS` 기준 PENDING/RUNNING/DONE/FAILED).
- [ ] 토큰 부족 메시지 UI.
- [ ] 분석 실패 시 사용자 직접 입력 fallback UI.
- [x] 마감 후 과제 상세(또는 전용 화면)에서 집단 코드 비교 분석 트리거·진행·결과(MD + 파일별 diff). `translationLanguage=none`이면 미노출. (가상 파일 `main` 1개 기준)

### 15.4 테스트

- [ ] OpenRouter 클라이언트 mock 단위 테스트.
- [ ] 토큰 차감 조건 단위 테스트(성공 시에만 차감, 캐시 hit 미차감).
- [ ] AI 봇 댓글이 실제 `COMMENTS`/`REVIEWS`에 등록되는지 통합 테스트(`is_ai_bot=true`, `ai_review_run_id`).
- [ ] `useAiFeedback=false`일 때 코드 리뷰 작업이 큐 단계에서 거부되는 테스트.
- [ ] 자동 트리거 없음 단위 테스트(새 제출/새 코드 버전 생성으로 큐가 발행되지 않음).
- [ ] 트리거 권한 테스트(제출 작성자/그룹장/그룹 관리자만 가능, 일반 그룹원은 `FORBIDDEN`).
- [ ] 같은 버전에 `RUNNING` run이 있을 때 추가 트리거가 `CONFLICT`로 거부되는 테스트.
- [ ] 같은 버전 재실행 결과 누적 테스트(이전 봇 댓글이 살아 있고 새 댓글이 추가됨).
- [ ] AI 봇 댓글 삭제 권한 테스트(그룹장/그룹 관리자만, 일반 그룹원과 제출 작성자는 거부).
- [ ] 큐 consumer 실패 후 재시도/실패 알림 단위 테스트.
- [ ] AI 댓글·리뷰가 사람 댓글과 같은 스레드에서 정렬되는 시각 회귀(Phase 14에서 자동화).
- [x] 집단 코드 비교 분석: 트리거 거절 규칙 단위 테스트(`assignment-cohort-analysis.policy.spec.ts`). (통합·스냅샷 일치 테스트는 미작성)

### 15.5 완료 정의

- 제출 후 비동기로 AI 코드 리뷰가 사람 댓글과 같은 시스템에 등록됩니다.
- 토큰 부족 시 등록이 차단되고 명확한 메시지가 표시됩니다.
- 문제 URL 분석 결과가 과제 메타에 머지되고 사용자가 수동 수정할 수 있습니다.
- 마감 후 과제당 1회 성공하는 집단 코드 비교 분석이 동작하고, 메타 비저장 정책을 만족합니다. (워커 큐·데드코드 정적 분석·토큰 잔액 연동은 미완)

---

## 16. Phase 11 - 알림(SSE)과 deadline 임박

### 16.1 진행 방향

- 인앱 알림만 1차 지원합니다. 외부 메신저 미지원.
- 실시간 푸시는 SSE로 단순하게 구현합니다.
- deadline 임박 알림은 24시간 전, 1시간 전 두 시점에 발송합니다.

### 16.2 BE / Worker

- [ ] 알림 엔터티와 종류(events) 상수 정의(`COMMENT_CREATED`, `REVIEW_CREATED`, `AI_REVIEW_DONE`, `AI_REVIEW_FAILED`, `PROBLEM_ANALYSIS_DONE`, `PROBLEM_ANALYSIS_FAILED`, `JOIN_REQUEST_CREATED`, `JOIN_REQUEST_DECIDED`, `EMAIL_INVITE_ACCEPTED`, `DEADLINE_24H`, `DEADLINE_1H` 등).
- [ ] `GET /api/v1/notifications` 목록.
- [ ] `POST /api/v1/notifications/read-all` 전체 읽음.
- [ ] `POST /api/v1/notifications/:id/read` 개별 읽음.
- [ ] `DELETE /api/v1/notifications/:id` 개별 삭제.
- [ ] `DELETE /api/v1/notifications` 전체 삭제.
- [ ] `GET /api/v1/notifications/unread-count` 빠른 집계.
- [ ] `GET /api/v1/notifications/stream` SSE.
- [ ] 알림 fan-out 큐(`notify.fanout`) 처리.
- [ ] deadline 임박 스케줄러(24시간/1시간 전).
- [ ] 클릭 대상 삭제 시 `관련 페이지가 삭제되었습니다` 응답 정책.
- [ ] 알림 TTL 없음 / 그룹 삭제 후에도 알림 보존 / off 미지원 정책 반영.

### 16.3 FE

- [ ] 상단바 알림 아이콘 + unread 숫자 배지.
- [ ] 알림 드롭다운 미리보기.
- [ ] 알림 목록 화면.
- [ ] 읽음/안읽음 표시 UI.
- [ ] 전체 읽음/개별 읽음 UI.
- [ ] 개별/전체 삭제 UI.
- [ ] 알림 클릭 → 대상 위치 이동.
- [ ] 삭제된 대상 이동 시 `존재하지 않는 페이지입니다` 상태.
- [ ] SSE 연결 훅과 재연결 정책.

### 16.4 테스트

- [ ] 알림 CRUD 단위 테스트.
- [ ] TTL 없음 보존 테스트.
- [ ] 삭제 대상 이동 메시지 테스트.
- [ ] deadline 임박 스케줄 단위 테스트.
- [ ] SSE 연결 / 재연결 단위 테스트.

### 16.5 완료 정의

- 모든 핵심 이벤트가 알림으로 도달하고 SSE 푸시로 즉시 갱신됩니다.

---

## 17. Phase 12 - 캘린더와 검색

### 17.1 진행 방향

- 그룹 캘린더만 지원합니다. 개인 캘린더 없음.
- 주간 뷰 기본, 월간 뷰 전환.
- 검색은 그룹 내부 과제만 대상으로 합니다.

### 17.2 BE

- [ ] `GET /api/v1/groups/:groupId/calendar?view=week|month&date=...` 캘린더 데이터.
- [ ] 캘린더 필터(상태/제출/지각/AI/플랫폼/태그/작성자).
- [ ] `GET /api/v1/groups/:groupId/assignments/search` 과제 검색. (기본 deadline 임박순, 보조 최신순)
- [ ] 검색 인덱스 / 페이지네이션.

### 17.3 FE

- [ ] 그룹 캘린더 주간 뷰 UI.
- [ ] 그룹 캘린더 월간 뷰 UI.
- [ ] 모바일 점 표시 + 날짜 상세 목록.
- [ ] 캘린더 필터 UI.
- [ ] 그룹 내부 과제 검색 UI.
- [ ] 검색 정렬/필터 UI.

### 17.4 테스트

- [ ] 캘린더 데이터 단위 테스트(주간/월간 경계).
- [ ] 캘린더 필터 단위 테스트.
- [ ] 검색 정렬 단위 테스트.
- [ ] 캘린더 desktop / mobile 시각 검증.

### 17.5 완료 정의

- 캘린더와 검색을 통해 과제 흐름을 한눈에 파악할 수 있습니다.

---

## 18. Phase 13 - 공지와 커뮤니티

### 18.1 진행 방향

- 공지와 커뮤니티는 같은 게시판 모델로 설계합니다.
- 본문은 Markdown + code block을 지원합니다.
- 첨부파일/이미지 미지원.

### 18.2 BE

- [ ] 공지 CRUD.
- [ ] 공지 댓글 CRUD.
- [ ] 공지 고정/중요 표시.
- [ ] 공지 읽음 수 집계(중복 제거).
- [ ] 커뮤니티 글 CRUD.
- [ ] 커뮤니티 댓글 CRUD.
- [ ] 커뮤니티 카테고리(`자유` 단일 시작).
- [ ] Markdown 본문 처리 + code block 검증.
- [ ] 공지 / 커뮤니티 알림 발행 훅.

### 18.3 FE

- [ ] 공지 목록 / 상세 / 작성 / 수정 UI.
- [ ] 공지 댓글 UI.
- [ ] 공지 읽음 수 UI.
- [ ] 커뮤니티 목록 / 상세 / 작성 / 수정 UI.
- [ ] 커뮤니티 카테고리 UI.
- [ ] Markdown + shiki code block 렌더링 UI.
- [ ] 첨부파일/이미지 미지원 UI 명시.

### 18.4 테스트

- [ ] 공지 권한 단위 테스트(작성/수정/삭제).
- [ ] 커뮤니티 작성 권한 테스트.
- [ ] Markdown 렌더링 회귀 테스트(XSS 안전성 포함).
- [ ] 게시판 desktop / mobile 시각 검증.

### 18.5 완료 정의

- 공지와 커뮤니티가 같은 코드 베이스를 공유하면서도 정책 차이가 명확히 동작합니다.

---

## 19. Phase 14 - E2E와 회귀 점검

### 19.1 진행 방향

- Playwright로 핵심 시나리오 E2E를 작성합니다.
- 라이트/다크/한국어/영어 4조합 회귀 스크린샷을 찍습니다.

### 19.2 작업

- [ ] Playwright 초기 설정. (CI 분리 워크플로)
- [ ] E2E 시나리오 1. (Google 로그인 → 그룹 생성(규칙 7개 포함) → 과제 생성 → 코드 제출 → AI 봇 리뷰 등록 확인 → 사람 댓글/리뷰)
- [ ] E2E 시나리오 2. (그룹 코드 입력 가입 → 가입 토글 off 시 차단 → 영구 링크 가입 → 이메일 초대로 미가입자 가입)
- [ ] E2E 시나리오 3. (그룹 코드 갱신 → 이전 코드/링크 404 확인)
- [ ] E2E 시나리오 4. (deadline 임박 알림 수신 → 클릭 이동)
- [ ] E2E 시나리오 5. (코드 번역 캐시 hit/miss/원본==대상 언어 모두 확인)
- [ ] 회귀 스크린샷. (light/dark × ko/en × desktop/mobile)
- [ ] 접근성 기본 점검. (키보드, 포커스 표시, 상태 텍스트)
- [ ] 권한/보안 회귀 테스트.
- [ ] 성능 병목 쿼리 확인 및 인덱스 보완.
- [ ] 장애 시나리오 점검. (LLM 실패, 큐 적체, OAuth 실패)
- [ ] 운영 로그/모니터링 최소 구성.
- [ ] 문서 최종 동기화. (`design/*.md`)

### 19.3 완료 정의

- 핵심 시나리오 3개가 E2E로 통과합니다.
- 회귀 스크린샷 비교에서 의도되지 않은 변화가 없습니다.

---

## 20. CI 게이트

PR/푸시 시 다음을 통과시킵니다.

- BE.
  - `tsc --noEmit`.
  - `eslint`.
  - `vitest run --coverage` (BE 커버리지 70~80% 라인 기준).
  - 마이그레이션 dry-run.
- FE.
  - `tsc --noEmit`.
  - `eslint`.
  - `vitest run --coverage` (FE 60% 이상).
  - `next build`.
- 공통.
  - `pnpm install --frozen-lockfile`.
  - `verify-i18n` 키 동기화 검사.

E2E는 별도 워크플로(`.github/workflows/e2e.yml`)에서 야간 실행합니다.

---

## 21. 작업 기록 템플릿

각 작업 종료 시 아래 템플릿으로 기록합니다.

- 작업 ID.
- 작업 제목.
- 시작 시각.
- 종료 시각.
- 변경 파일.
- 실행 테스트 명령.
- 테스트 결과.
- 체크리스트 반영 완료 여부.

작업 ID 규칙은 다음과 같습니다.

- `P{Phase번호}-{영역}-{일련번호}`.
- 영역은 다음 중 하나로 사용합니다.
  - `INFRA`, `DB`, `AUTH`, `UI`, `GROUP`, `INVITE`, `ASSIGN`, `SUBMIT`, `REVIEW`, `POLICY`, `AI`, `NOTI`, `CAL`, `BOARD`, `E2E`.

---

## 22. 작업 기록(보존)

이전 작업 기록은 그대로 보존합니다. 새 Phase 구성 도입 이전의 진행 내역도 추후 추적을 위해 남깁니다.

- 작업 ID: P1-INFRA-001
- 작업 제목: Docker Compose 로컬 개발 구성 추가
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `docker-compose.yml`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `worker/*`, `design/*.md`, `AGENTS.md`, `CLAUDE.md`
- 실행 테스트 명령: `node --check worker/src/main.js`, `node -e "JSON.parse(...)"`, `ruby -e "require 'yaml'; YAML.load_file('docker-compose.yml')"`, `docker compose config`, `pnpm install --lockfile-only`
- 테스트 결과: worker 구문 확인 통과, package JSON 파싱 통과, Compose YAML 파싱 통과, `docker` 명령 없음, `pnpm` 명령 없음
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P1-UI-001
- 작업 제목: UI 작업 기준과 Phase별 FE 체크리스트 정리
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `design/checklist.md`
- 실행 테스트 명령: `rg -n "Phase 1.5|Phase [0-9]+-FE|desktop/mobile|UI 구현" design/checklist.md`, `wc -l design/checklist.md`
- 테스트 결과: UI 기준 Phase와 Phase별 FE 항목 확인, 503줄
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P1-UI-002
- 작업 제목: 라이트/다크 테마와 한국어/영어 i18n 전역 인프라 구성
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `fe/app/layout.tsx`, `fe/app/page.tsx`, `fe/app/HomeClient.tsx`, `fe/app/me/page.tsx`, `fe/app/me/MeClient.tsx`, `fe/app/globals.css`, `fe/app/*.module.css`, `fe/src/theme/*`, `fe/src/i18n/*`, `fe/src/providers/*`, `fe/src/components/*`, `fe/src/lib/*`, `fe/scripts/verify-i18n.mjs`, `fe/global.d.ts`, `fe/package.json`, `design/design.md`, `design/architecture.md`, `design/ui.md`, `design/checklist.md`
- 실행 테스트 명령: `node fe/scripts/verify-i18n.mjs`, `node_modules/.bin/tsc -p fe/tsconfig.json --noEmit`, `fe/node_modules/.bin/next build fe`
- 테스트 결과: i18n 키 구조 검증 통과, TypeScript noEmit 통과, Next build는 Next SWC 바이너리 코드 서명 문제와 WASM SWC 미설치로 실패
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P1-BE-DOCS-001
- 작업 제목: Swagger/OpenAPI 문서 엔드포인트 추가
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/app.module.ts`, `be/src/modules/docs/*`, `design/api-spec.md`, `design/architecture.md`, `design/checklist.md`
- 실행 테스트 명령: `node_modules/.bin/tsc -p be/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p be/tsconfig.json`, `node be/dist/main.js`, `curl -I http://localhost:4000/api-docs`, `curl -I http://localhost:4000/api-docs/json`, `curl -s http://localhost:4000/api-docs/json`
- 테스트 결과: TypeScript noEmit 통과, BE 빌드 통과, `/api-docs` 200 OK, `/api-docs/json` 200 OK 및 OpenAPI JSON 응답 확인
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P1-ENV-001
- 작업 제목: OAuth 환경변수 예시 추가
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `.env.example`, `design/api-spec.md`, `design/checklist.md`
- 실행 테스트 명령: `node -e "const fs=require('fs'); const text=fs.readFileSync('.env.example','utf8'); for (const key of ['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REDIRECT_URI','GITHUB_OAUTH_CLIENT_ID','GITHUB_OAUTH_CLIENT_SECRET','GITHUB_OAUTH_REDIRECT_URI']) if (!text.includes(key+'=')) throw new Error(key);"`
- 테스트 결과: OAuth 환경변수 키 존재 확인 통과
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P2-AUTH-001
- 작업 제목: OAuth start 엔드포인트 provider 리다이렉트 수정
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/auth/auth.service.ts`, `be/src/modules/auth/auth.controller.ts`, `be/src/modules/docs/openapi.ts`, `design/checklist.md`
- 실행 테스트 명령: `node_modules/.bin/tsc -p be/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p be/tsconfig.json`, `BE_PORT=4100 GOOGLE_OAUTH_CLIENT_ID=test-google GITHUB_OAUTH_CLIENT_ID=test-github node be/dist/main.js`, `curl -I http://localhost:4100/api/v1/auth/oauth/google/start`, `curl -I http://localhost:4100/api/v1/auth/oauth/github/start`
- 테스트 결과: TypeScript noEmit 통과, BE 빌드 통과, Google/GitHub OAuth start 모두 provider authorization URL로 302 응답 확인
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P2-AUTH-002
- 작업 제목: BE dev 실행에서 OAuth DI 주입 누락 수정
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/package.json`, `be/src/modules/auth/auth.controller.ts`, `be/src/modules/auth/auth.service.ts`, `be/src/modules/users/users.controller.ts`, `design/checklist.md`
- 실행 테스트 명령: `node_modules/.bin/tsc -p be/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p be/tsconfig.json`, `BE_PORT=4100 GOOGLE_OAUTH_CLIENT_ID=test-google GITHUB_OAUTH_CLIENT_ID=test-github be/node_modules/.bin/tsx --tsconfig be/tsconfig.json be/src/main.ts`, `curl -I http://localhost:4100/api/v1/auth/oauth/google/start`
- 테스트 결과: TypeScript noEmit 통과, BE 빌드 통과, tsx + tsconfig dev 실행 통과, Google OAuth start 302 응답 확인
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P1-ENV-002
- 작업 제목: BE 환경변수 SSOT와 fallback 금지 규칙 정정
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*`, `playbook/core/code-hygiene.md`, `playbook/backend/nestjs.md`, `playbook/security.md`, `be/package.json`, `be/src/main.ts`, `be/src/modules/auth/auth.service.ts`, `design/api-spec.md`, `design/checklist.md`
- 실행 테스트 명령: `node_modules/.bin/tsc -p be/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p be/tsconfig.json`, `node --env-file=.env.local -e "for (const key of ['BE_PORT','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_REDIRECT_URI']) if (!process.env[key]) throw new Error(key + ' missing');"`, `node --env-file=.env.local -e "import('./be/dist/modules/auth/auth.service.js').then(({AuthService}) => { const url = new AuthService({}).getOAuthStartUrl('google'); if (!url.startsWith('https://accounts.google.com/')) throw new Error(url); if (!url.includes(encodeURIComponent(process.env.GOOGLE_OAUTH_REDIRECT_URI))) throw new Error('redirect uri missing'); })"`
- 테스트 결과: TypeScript noEmit 통과, BE 빌드 통과, 루트 `.env.local`에서 Google OAuth 필수 env 로딩 확인 통과, Google OAuth start URL이 env redirect URI를 사용함 확인 통과
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P2-AUTH-003
- 작업 제목: OAuth provider 분기 code-style 위반 수정
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/auth/auth.service.ts`, `design/checklist.md`
- 실행 테스트 명령: `rg -n "if \\(provider|provider === \\"|provider !== \\"|provider \\?" be/src/modules/auth/auth.service.ts`, `node_modules/.bin/tsc -p be/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p be/tsconfig.json`
- 테스트 결과: `auth.service.ts`의 provider enum/type 분기 비교 제거 확인, TypeScript noEmit 통과, BE 빌드 통과
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P2-AUTH-004
- 작업 제목: OAuth 현재 구현 상태 체크리스트 정정
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `design/checklist.md`, `design/api-spec.md`, `design/architecture.md`
- 실행 테스트 명령: `rg -n "현재 OAuth 구현 상태|placeholder|token 교환|userinfo|dev-session" design/checklist.md design/api-spec.md design/architecture.md`
- 테스트 결과: OAuth start는 실제 provider redirect, callback/profile/session은 placeholder 상태로 문서화 확인
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P0-PLAN-001
- 작업 제목: 결정사항 반영과 Phase 0~14 전면 재작성
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `design/checklist.md`
- 실행 테스트 명령: 본 문서 한국어 콜론 종결 / 항목 누락 자체 점검
- 테스트 결과: 결정사항 11개 영역 반영, Phase 0~14 todo 작성, 기존 작업 기록 보존
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P1-DB-001
- 작업 제목: TypeORM 엔티티 23개 + 1차 마이그레이션 + seed:dev + 헬스체크
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/config/data-source.ts`, `be/src/modules/{users,groups,invites,assignments,submissions,comments,reviews,notifications,calendar,board,ai-tokens,health}/**`, `be/migrations/1700000000000-init.ts`, `be/scripts/{migrate,seed-dev}.ts`, `be/src/__tests__/entities.test.ts`, `be/src/shared/redis/redis.client.ts`, `be/vitest.config.ts`, `be/package.json`, `be/src/modules/app.module.ts`
- 실행 테스트 명령: `pnpm --filter be test`, `pnpm --filter be db:migrate`, `pnpm --filter be db:revert`, `pnpm --filter be db:migrate`, `pnpm --filter be db:seed`, `curl /api/v1/health/db`, `curl /api/v1/health/redis`
- 테스트 결과: 24 entity tests pass, 24 테이블 up→down→up 사이클 OK, 시드 OK, 헬스체크 ok:true
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P2-AUTH-001
- 작업 제목: OAuth 토큰 교환 + Redis 세션 + AuthGuard + FE 세션 전달
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/auth/**`, `be/src/modules/users/**`, `be/src/modules/docs/openapi.ts`, `be/src/main.ts`, `fe/app/{page.tsx,login/**,me/**}`, `fe/src/auth/api.server.ts`, `fe/src/i18n/messages.ts`, `design/api-spec.md`, `design/architecture.md`
- 실행 테스트 명령: `pnpm --filter be build`, `pnpm --filter be test`, `pnpm --filter fe build`, `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/v1/users/me`, `curl -s -D - -o /dev/null http://localhost:4000/api/v1/auth/oauth/google/start | grep HTTP`
- 테스트 결과: BE 테스트 30 pass, FE build 성공, `/users/me` 미인증 302 OAuth start에서 state 쿠키 set과 google redirect 확인
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P3-SHELL-001
- 작업 제목: AppShell + 디자인 토큰 + 공용 UI(`Button/Input/Modal/Tabs/Chip/Badge`) + 상태 컴포넌트 + Icon 스프라이트 + QueryProvider
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `fe/app/{layout.tsx,globals.css,page.tsx,page.module.css,login/**,me/**,groups/**,assignments/**}`, `fe/src/shell/AppShell.{tsx,module.css}`, `fe/src/ui/**`, `fe/src/providers/{AppProviders.tsx,QueryProvider.tsx}`, `fe/src/i18n/messages.ts`, `fe/public/icons/icons.svg`, `fe/scripts/verify-i18n.mjs`, `fe/package.json`
- 실행 테스트 명령: `pnpm --filter fe test:i18n`, `pnpm --filter fe test`, `pnpm --filter fe build`
- 테스트 결과: i18n 38/38 ok, vitest 5 pass, Next build 5 routes ok
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P0-INFRA-002
- 작업 제목: packages/shared 도입 + Vitest/ESLint/Prettier + .env.local 키 보강 + worker fail-fast
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `packages/shared/**`, `pnpm-workspace.yaml`, `package.json`, `eslint.config.js`, `prettier.config.js`, `be/package.json`, `fe/package.json`, `worker/package.json`, `be/vitest.config.ts`, `fe/vitest.config.ts`, `fe/vitest.setup.ts`, `worker/vitest.config.ts`, `worker/src/main.js`, `worker/src/health.test.js`, `be/src/config/env.ts`, `.env.local`, `scripts/verify-env.mjs`, `design/checklist.md`
- 실행 테스트 명령: `pnpm install`, `node_modules/.bin/tsc -p packages/shared/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p be/tsconfig.json --noEmit`, `node_modules/.bin/tsc -p fe/tsconfig.json --noEmit`, `pnpm --filter @psstudio/shared test`, `pnpm --filter worker test`, `node scripts/verify-env.mjs`, env 누락 시 worker 부팅 실패 검증
- 테스트 결과: typecheck 3개 0 error, shared vitest 5 pass, worker vitest 1 pass, env keys ok, worker fail-fast 명확한 에러 throw 확인
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P3-THEME-001
- 작업 제목: 라이트 모드 밝기 완화
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `fe/app/globals.css`, `design/checklist.md`
- 실행 테스트 명령: `pnpm --filter fe test:i18n`, `pnpm --filter fe test`, `pnpm --filter fe build`, `node scripts/verify-i18n.mjs`(cwd `fe`), `node_modules/.bin/tsc -p fe/tsconfig.json --noEmit`, `fe/node_modules/.bin/next build fe`
- 테스트 결과: `pnpm` 명령 없음, TypeScript noEmit 통과, i18n 검사는 기존 en 번역 키 누락(`groups.add`, `groups.home`, `groupsAdd.*`, `groupsExplore.*`)으로 실패, Next build는 `pnpm` 없음과 Next SWC 바이너리 코드 서명 문제로 실패
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P4-GROUPS-SETTINGS-001
- 작업 제목: 그룹 설정 화면 전체 메타 수정 + 그룹 코드 갱신 모달
- 시작 시각: 2026-05-08
- 종료 시각: 2026-05-08
- 변경 파일: `fe/app/groups/[groupId]/GroupDetailClient.tsx`, `fe/app/groups/[groupId]/GroupDetailClient.module.css`, `fe/app/groups/[groupId]/page.tsx`, `fe/app/groups/actions.ts`, `fe/src/groups/server.ts`, `fe/src/i18n/messages.ts`, `design/checklist.md`
- 실행 테스트 명령: `node_modules/.bin/tsc -p fe/tsconfig.json --noEmit`, `node scripts/verify-i18n.mjs`(cwd `fe`), `./node_modules/.bin/next build`(cwd `fe`), `fe/node_modules/.bin/vitest run --passWithNoTests`, `be/node_modules/.bin/vitest run`
- 테스트 결과: FE TypeScript noEmit 통과, i18n keys ok(ko/en 289개), Next build 통과, FE/BE Vitest는 Rollup native optional dependency 코드 서명 문제(`@rollup/rollup-darwin-arm64`)로 startup 실패
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P4-GROUPS-001
- 작업 제목: 그룹 CRUD + 멤버 역할/위임/강퇴/탈퇴 + 권한 매트릭스 단일 함수
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/groups/permissions.ts`, `be/src/modules/groups/groups.service.ts`, `be/src/modules/groups/groups.controller.ts`, `be/src/modules/groups/groups.module.ts`, `be/src/modules/groups/permissions.spec.ts`, `be/src/modules/groups/groups.service.spec.ts`, `be/src/modules/app.module.ts`, `be/vitest.config.ts`, `fe/src/api/server.ts`, `fe/src/groups/server.ts`, `fe/app/groups/page.tsx`, `fe/app/groups/page.module.css`, `fe/app/groups/CreateGroupForm.tsx`, `fe/app/groups/CreateGroupForm.module.css`, `fe/app/groups/actions.ts`, `fe/app/groups/[groupId]/page.tsx`, `fe/app/groups/[groupId]/GroupDetailClient.tsx`, `fe/app/groups/[groupId]/GroupDetailClient.module.css`, `design/checklist.md`
- 실행 테스트 명령: `pnpm --filter be typecheck`, `pnpm --filter be test`, `pnpm --filter fe build`
- 테스트 결과: BE typecheck 0 error, BE 단위 테스트 40 pass(권한 매트릭스 5 + 그룹 CRUD/위임/탈퇴 5 포함), FE Next 빌드 통과(/groups, /groups/[groupId] 동적 라우트)
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P5-INVITES-001
- 작업 제목: 초대 링크/초대 코드/가입 신청 끝까지 닫기
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/invites/invites.service.ts`, `be/src/modules/invites/invites.controller.ts`, `be/src/modules/invites/invites.module.ts`, `be/src/modules/invites/invites.service.spec.ts`, `be/src/modules/app.module.ts`, `fe/src/invites/server.ts`, `fe/app/groups/[groupId]/invite/page.tsx`, `fe/app/groups/[groupId]/invite/InviteManageClient.tsx`, `fe/app/groups/[groupId]/invite/InviteManageClient.module.css`, `fe/app/groups/[groupId]/invite/actions.ts`, `fe/app/invite/[token]/page.tsx`, `fe/app/invite/[token]/page.module.css`, `fe/app/invite/[token]/actions.ts`, `fe/app/join-by-code/page.tsx`, `fe/app/join-by-code/page.module.css`, `fe/app/join-by-code/actions.ts`, `design/checklist.md`
- 실행 테스트 명령: `pnpm --filter be typecheck`, `pnpm --filter be test`, `pnpm --filter fe build`
- 테스트 결과: BE typecheck 0 error, BE invite 시나리오 7 pass(만료/한도/중복/승인/거절/코드 가입), FE 빌드 통과(`/invite/[token]`, `/join-by-code`, `/groups/[groupId]/invite`)
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P6-ASSIGN-001
- 작업 제목: 과제 CRUD + 문제 URL 파서 + 메타데이터 수정 + 삭제 영향 카운트
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/assignments/problem-parser.ts`, `be/src/modules/assignments/__tests__/problem-parser.spec.ts`, `be/src/modules/assignments/assignments.service.ts`, `be/src/modules/assignments/assignments.controller.ts`, `be/src/modules/assignments/assignments.module.ts`, `be/src/modules/assignments/__tests__/assignments.service.spec.ts`, `be/src/modules/app.module.ts`, `fe/src/assignments/server.ts`, `fe/app/groups/[groupId]/assignments/page.tsx`, `fe/app/groups/[groupId]/assignments/page.module.css`, `fe/app/groups/[groupId]/assignments/actions.ts`, `fe/app/groups/[groupId]/assignments/new/page.tsx`, `fe/app/groups/[groupId]/assignments/new/page.module.css`, `fe/app/groups/[groupId]/assignments/[assignmentId]/page.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/settings/page.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/settings/AssignmentSettingsClient.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/settings/AssignmentSettingsClient.module.css`, `design/checklist.md`
- 실행 테스트 명령: `pnpm --filter be typecheck`, `pnpm --filter be test`, `pnpm --filter fe build`
- 테스트 결과: BE typecheck 0 error, 파서 5 pass, 과제 서비스 5 pass(생성·URL 변경 시 분석 PENDING 재설정·메타데이터 머지·삭제 트랜잭션·확인 불일치 거부), FE 빌드 통과(과제 목록/생성/상세/설정 라우트)
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P7-SUBMIT-001
- 작업 제목: 제출 CRUD + 버전 누적 + diff 캐시 + 키워드 기반 언어 감지 + shiki 코드 뷰어
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/modules/submissions/language-detect.ts`, `be/src/modules/submissions/__tests__/language-detect.spec.ts`, `be/src/modules/submissions/submissions.service.ts`, `be/src/modules/submissions/submissions.controller.ts`, `be/src/modules/submissions/submissions.module.ts`, `be/src/modules/submissions/__tests__/submissions.service.spec.ts`, `be/src/modules/app.module.ts`, `fe/src/submissions/server.ts`, `fe/src/submissions/detect.ts`, `fe/src/ui/CodeViewer.tsx`, `fe/src/ui/CodeViewer.module.css`, `fe/next.config.ts`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/page.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/page.module.css`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/actions.ts`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/new/page.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/new/NewSubmissionForm.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/new/NewSubmissionForm.module.css`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/page.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/SubmissionDetailClient.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/SubmissionDetailClient.module.css`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/diff/page.tsx`, `fe/app/groups/[groupId]/assignments/[assignmentId]/submissions/[submissionId]/diff/page.module.css`, `design/checklist.md`
- 실행 테스트 명령: `pnpm --filter be typecheck`, `pnpm --filter be test`, `pnpm --filter fe build`, `pnpm -r --parallel typecheck`, `pnpm -r --parallel test`
- 테스트 결과: BE typecheck 0 error, 언어 감지 5 pass, 제출 서비스 8 pass(버전 누적·diff 캐시·200KB 거부·언어 변경 거부·작성자 외 수정 거부·관리자 강제 삭제 등), 모노레포 typecheck 4/4 pass, BE 단위 테스트 70 pass, FE Next 빌드 통과(`extensionAlias`로 `.js→.ts` 해석, 제출 목록/신규/상세/diff 동적 라우트)
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P4-GROUPS-V2-001
- 작업 제목: 그룹 모델 v2 마이그레이션 + Resend 통합 + 영구 토큰/이메일 초대 BE/FE 일괄
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `be/src/config/env.ts`, `be/src/modules/groups/{group.entity.ts,groups.service.ts,groups.controller.ts}`, `be/src/modules/invites/{group-invite-link.entity.ts,group-email-invite.entity.ts,join-request.entity.ts,invites.service.ts,invites.controller.ts,invites.service.spec.ts}`, `be/src/modules/email/{resend-mail.service.ts,resend-mail.service.spec.ts}`, `be/migrations/<v2>-groups-rewrite.ts`, `fe/src/groups/server.ts`, `fe/src/invites/server.ts`, `fe/app/groups/new/{page.tsx,NewGroupForm.tsx}`, `fe/app/groups/[groupId]/{page.tsx,GroupDetailClient.tsx}`, `fe/app/groups/[groupId]/invite/{page.tsx,InviteManageClient.tsx,actions.ts}`, `fe/app/invite/{[token]/{page.tsx,InviteLandingClient.tsx,actions.ts},email/[token]/{page.tsx,EmailInviteClient.tsx,actions.ts}}`, `fe/app/join-by-code/{page.tsx,JoinByCodePageForm.tsx,actions.ts}`, `fe/src/i18n/messages.ts`, `design/{design.md,api-spec.md,erd.md,architecture.md,checklist.md}`
- 실행 테스트 명령: `pnpm --filter be exec tsc --noEmit`, `pnpm --filter be test`, `pnpm --filter fe exec tsc --noEmit`
- 테스트 결과: BE typecheck 0 error, BE 테스트 통과(invites 시나리오 + Resend mock), FE typecheck 0 error
- 체크리스트 반영 완료 여부: yes

- 작업 ID: P3-UI-002
- 작업 제목: 폼 컴포넌트 표준화(Switch/SegmentedControl) + 모달 일관화 + 한글 i18n 전수 적용
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `fe/src/ui/{Switch.tsx,Switch.module.css,SegmentedControl.tsx,SegmentedControl.module.css,Modal.tsx,Modal.module.css,states/{ErrorState.tsx,EmptyState.tsx}}`, `fe/src/i18n/{messages.ts,I18nProvider.tsx,ServerText.ts}`, `fe/src/shell/AppShell.tsx`, `fe/app/{page.tsx,HomeClient.tsx,page.module.css,me/{page.tsx,MeClient.tsx,MeClient.module.css},login/page.tsx,assignments/page.tsx,groups/new/{page.tsx,NewGroupForm.tsx},groups/[groupId]/{page.tsx,GroupDetailClient.tsx,invite/{page.tsx,InviteManageClient.tsx},assignments/{page.tsx,AssignmentsListClient.tsx,new/{page.tsx,NewAssignmentForm.tsx},[assignmentId]/{page.tsx,AssignmentDetailClient.tsx,settings/{page.tsx,AssignmentSettingsClient.tsx},submissions/{page.tsx,SubmissionsListClient.tsx,new/{page.tsx,NewSubmissionForm.tsx},[submissionId]/{page.tsx,SubmissionDetailPageClient.tsx,SubmissionDetailClient.tsx,diff/page.tsx}}}},invite/{[token]/{page.tsx,InviteLandingClient.tsx},email/[token]/{page.tsx,EmailInviteClient.tsx}},join-by-code/{page.tsx,JoinByCodePageForm.tsx}}`
- 실행 테스트 명령: `pnpm --filter fe exec tsc --noEmit`, `node fe/scripts/verify-i18n.mjs`
- 테스트 결과: FE typecheck 0 error, i18n 키 동기화 통과
- 체크리스트 반영 완료 여부: yes
- 핵심 결정
  - `t(key, vars)`에 `{key}` 변수 치환 추가. `AppShell`에 `titleKey`/`titleVars`/`subtitleKey`/`subtitleVars` props 추가.
  - `ErrorState`/`EmptyState`에 `titleKey`/`descriptionKey`/`*Vars` props 추가, 클라이언트 컴포넌트로 전환.
  - 체크박스/드롭다운 → `Switch`/`SegmentedControl`. 모든 모달은 `fe/src/ui/Modal.module.css`의 표준 스타일을 따른다.
  - 사용자 입장의 한국어 라벨/캡션을 모두 `messages.ts` 키로 옮김. 코드/플랫폼/언어 이름은 번역 제외.

- 작업 ID: P4-GROUPS-V2-002
- 작업 제목: 그룹 진입 단일화(/groups/explore + AddGroupModal + 마지막 접근 그룹 리다이렉트) + 홈 대시보드 placeholder
- 시작 시각: 2026-05-07
- 종료 시각: 2026-05-07
- 변경 파일: `fe/app/groups/page.tsx`, `fe/app/groups/{AddGroupModal.tsx,AddGroupModal.module.css,JoinByCodeCard.tsx}`, `fe/app/groups/explore/{page.tsx,GroupsExploreView.tsx,page.module.css}`, `fe/app/groups/[groupId]/{page.tsx,GroupDetailClient.tsx,GroupHeaderActions.tsx,GroupHeaderActions.module.css}`, `fe/src/groups/{server.ts,lastGroupCookie.ts}`, `be/src/modules/groups/groups.service.ts`, `fe/app/{page.tsx,HomeClient.tsx,page.module.css}`, `fe/public/icons/icons.svg`, `fe/src/ui/Icon.tsx`, `fe/src/i18n/messages.ts`, `design/{design.md,architecture.md,api-spec.md,checklist.md}`
- 실행 테스트 명령: `pnpm --filter be exec tsc --noEmit`, `pnpm --filter fe exec tsc --noEmit`
- 테스트 결과: BE/FE typecheck 0 error, dev 서버 로그 `/groups → /groups/[id]` 200 흐름 확인
- 체크리스트 반영 완료 여부: yes
- 핵심 결정
  - `/groups`(카드 그리드)는 폐기. 서버 라우트로 만들고 가입 그룹 0개 → `/groups/explore`, 1개 이상 → 쿠키 `psstudio_last_group` 또는 첫 그룹으로 즉시 `redirect`.
  - 그룹 상세 헤더(`AppShell.actions`)에 “그룹 추가”(모달) + “그룹 둘러보기”(`/groups/explore`) 버튼을 같은 `Button` 컴포넌트로 배치(같은 크기).
  - “그룹 홈” 라벨은 사용 금지(키 `groups.home` 삭제, `groups.browse` = “그룹 둘러보기”).
  - `AddGroupModal`은 새 그룹 만들기와 초대 코드 가입을 같은 모달에서 분기. 초대 코드 카드(`JoinByCodeCard`)를 `/groups/explore`에서도 재사용.
  - 그룹 상세 진입 시 `psstudio_last_group` 쿠키(`SameSite=Lax`, max-age 약 400일) + `localStorage("psstudio:lastGroupId")` 동시 갱신.
  - `GET /api/v1/groups`에 `memberPreviews` 4명 추가(가입 시각 오름차순). FE 그룹 카드는 폐기됐지만 BE/타입은 유지(다른 사용처 대비).
  - 홈(`/`) 화면 재구성. 비로그인은 환영 hero, 로그인은 “최근 알림”·“최근 푼 문제” 두 카드 placeholder. `HomeClient`는 `notifications`/`submissions` props를 이미 받고, BE API 추가 시 서버 컴포넌트에서 주입하면 끝.

- 작업 ID: P6-ASSIGN-UX-002
- 작업 제목: 전역 과제 탭을 내 과제 통합 뷰로 전환 + 그룹 컨텍스트 네비 + 캘린더 골격 + 서버액션 전달 오류 복구
- 시작 시각: 2026-05-08
- 종료 시각: 2026-05-08
- 변경 파일: `fe/app/assignments/{page.tsx,page.module.css}`, `fe/app/groups/[groupId]/{GroupContextNav.tsx,GroupContextNav.module.css,GroupDetailClient.tsx}`, `fe/app/groups/[groupId]/calendar/{page.tsx,page.module.css}`, `fe/app/groups/[groupId]/assignments/{AssignmentsListClient.tsx,new/page.tsx}`, `fe/app/groups/[groupId]/assignments/[assignmentId]/{AssignmentDetailClient.tsx,settings/page.tsx,settings/AssignmentSettingsClient.tsx,submissions/new/page.tsx,submissions/[submissionId]/{page.tsx,SubmissionDetailPageClient.tsx}}`, `fe/src/i18n/messages.ts`, `design/{design.md,checklist.md}`
- 실행 테스트 명령: `node_modules/.bin/tsc -p fe/tsconfig.json --noEmit`, `node fe/scripts/verify-i18n.mjs`
- 테스트 결과: 진행 예정
- 체크리스트 반영 완료 여부: yes
- 핵심 결정
  - `/assignments`는 placeholder를 폐기하고 내 과제 통합 목록으로 변경합니다. (내가 속한 그룹의 과제를 합쳐 보여주고 원 그룹 상세로 링크)
  - 그룹 내부 페이지 상단에 공통 서브 네비(개요/캘린더/과제/초대 관리)를 추가해 그룹 컨텍스트를 통일합니다.
  - 그룹 캘린더는 1차 골격(날짜별 과제 카드)으로 먼저 노출하고, 주/월 전환과 상태 매트릭스는 후속 단계에서 확장합니다.
  - 서버 컴포넌트에서 클라이언트 컴포넌트로 전달하던 익명 함수 액션을 `bind` 기반 서버 액션으로 교체해 런타임 오류를 방지합니다.

---

## 23. 다음 작업자 인계 노트(2026-05-07 시점)

이 섹션은 다른 AI/개발자가 이 프로젝트를 이어받을 때 가장 먼저 읽어야 할 요약입니다. 자세한 정책은 §2.12와 각 Phase, 그리고 `design/design.md`/`design/api-spec.md`/`design/architecture.md`/`design/erd.md`를 봅니다.

### 23.1 시작할 때 읽을 문서 순서

1. `AGENTS.md` 또는 `CLAUDE.md` (행동 규칙).
2. `playbook/PLAYBOOK.index.yaml` (편집 라우팅).
3. `design/design.md` §2.12, §5.1, §5.1.3, §11.
4. `design/api-spec.md` §3, §4, §12.
5. `design/architecture.md` §3.1, §5.2.x.
6. `design/checklist.md` §9 Phase 4, §10 Phase 5, §22 최근 작업 기록.
7. 그 다음 작업 영역에 따라 `design/erd.md`와 해당 Phase 항목.

### 23.2 현재 시스템 상태 요약

- **Phase 0~5 끝까지 닫음(BE/FE 골격 + 신 그룹 모델 + 영구 토큰/이메일 초대).** Phase 6(과제) / Phase 7(제출/diff)도 1차 마감.
- **그룹 모델 v2** 적용 완료. 영구 그룹 코드 1개, 영구 초대 링크, 1회용 이메일 초대(Resend), 가입 토글 4종, 그룹 규칙 7항목.
- **FE i18n 전면 적용.** 사용자 입장 한국어/영어 문자열은 모두 `fe/src/i18n/messages.ts` 키로 통과시키고, `t(key, vars)`로 변수 치환. 새 화면을 만들 때 하드코딩 금지.
- **그룹 탭 라우팅이 `/groups` 카드 그리드에서 “마지막 접근 그룹 자동 이동”으로 바뀜.** 카드 그리드 화면을 다시 만들지 않습니다. `/groups/explore`만이 그룹을 새로 만들거나 가입하는 진입점입니다.
- **홈 대시보드는 placeholder 상태.** UI/CSS는 완성됐고 props만 비어 있습니다. BE API 두 개 추가하면 끝.
- **Phase 8(댓글/리뷰), Phase 9(번역), Phase 10(AI worker), Phase 11(알림 SSE), Phase 12~14는 미시작.**

### 23.3 “여기서부터 이어 한다” 우선순위

| 우선순위 | 작업 | 파일/엔드포인트 포인터 |
|---|---|---|
| 1 | 그룹 설정 화면(전체 메타 수정 + 그룹 코드 갱신 모달) | `fe/app/groups/[groupId]/GroupDetailClient.tsx` 설정 탭, 폼 참고 `fe/app/groups/new/NewGroupForm.tsx`, BE `PATCH /api/v1/groups/:id`, `POST /api/v1/groups/:id/code/regenerate` |
| 2 | 그룹 진입 페이지 단일화 | `/invite/[token]`, `/invite/email/[token]`, `/join-by-code`를 단일 자동 인식 페이지로 합치기. 미인증 시 `/login?next=...`. |
| 3 | 가입 신청 신 모델 검증 + 토글 분기 | `be/src/modules/invites/invites.service.ts` + 신규 spec. `joinMethods.request` off일 때 `APPROVED`만 `FORBIDDEN JOIN_DISABLED`. |
| 4 | 이메일/그룹 코드 갱신 BE 테스트 | `RATE_LIMITED`(1h 50건), `INVITE_EXPIRED`(7d), 코드 갱신 후 이전 코드/링크 `404`, OWNER 외 갱신 `FORBIDDEN`. |
| 5 | 홈 대시보드 데이터 연결 | `GET /api/v1/users/me/notifications?limit=5`, `GET /api/v1/users/me/submissions?limit=5&sort=createdAtDesc` 신규. `fe/app/page.tsx`에서 호출하고 `HomeClient`에 주입. |
| 6 | Phase 8 댓글/리뷰 | `design/checklist.md` §13. |
| 7 | Phase 9 번역, Phase 10 AI worker | §14, §15. AI 봇 사용자(`is_system_bot=true`)는 이미 시드에 들어 있음. |

### 23.4 절대 다시 만들지 말 것(회귀 금지)

- “내가 속한 그룹” 카드 그리드 화면. `/groups`는 서버 라우트이며 화면을 그리지 않습니다.
- “그룹 홈” 라벨. 같은 의미는 “그룹 둘러보기”(`groups.browse` 키)로 통일했습니다.
- 만료/한도 기반 초대 링크 모델. 영구 토큰 + 즉시 무효화로 단일화했습니다.
- 피드백 공개 정책 매트릭스(역할 × 단위 × deadline 전후). 그룹원 모두 공개 단일 정책으로 폐기됨(§2.12).
- AI 분석 결과 별도 패널. AI는 GitHub Bot 스타일로 댓글/리뷰 시스템 안에 인라인 작성합니다.

### 23.5 자주 쓰는 검증 명령

- 모노레포 typecheck: `pnpm --filter be exec tsc --noEmit`, `pnpm --filter fe exec tsc --noEmit`.
- BE 단위 테스트: `pnpm --filter be test`.
- i18n 키 동기화: `node fe/scripts/verify-i18n.mjs`.
- DB 마이그레이션: `pnpm --filter be db:migrate`, 되돌리기는 **`ALLOW_DB_REVERT=1 pnpm --filter be db:revert`**(의도한 경우만), 시드 `pnpm --filter be db:seed`. Docker로 DB를 쓰는 경우 **`docker compose down -v`는 볼륨 삭제로 DB·Redis 데이터가 사라집니다.**
- BE 헬스체크: `curl http://localhost:4000/api/v1/health/db`, `/health/redis`.

### 23.6 FE 작업 시 기억할 컨벤션

- 모든 사용자 텍스트는 `t("...")`로 통과시키고 `fe/src/i18n/messages.ts`(ko/en 동시) 갱신. 코드/플랫폼/언어 이름은 예외.
- `AppShell`은 `titleKey`/`titleVars`/`subtitleKey`/`subtitleVars`로 사용. 헤더 우측 액션이 필요하면 `actions` 슬롯 사용.
- 새 모달은 `fe/src/ui/Modal.tsx`를 그대로 쓰고 `Modal.module.css`의 표준 패딩/애니메이션을 따른다. 모달 안에서 폼을 쓰면 푸터 버튼 순서는 `취소(secondary) → 확정(primary 또는 danger)`.
- 체크박스 대신 `fe/src/ui/Switch.tsx`, 단순 enum 선택 대신 `fe/src/ui/SegmentedControl.tsx`.
- 새 SVG는 `fe/public/icons/icons.svg`에 `<symbol viewBox="0 0 24 24">`로 추가하고 `fe/src/ui/Icon.tsx`의 `IconName`에 키를 등록.
- 새 소스 파일 첫 줄에 한국어 한 줄 주석으로 역할을 적는다.
- 그룹 탭 진입 동작을 바꿀 일이 있으면 `fe/app/groups/page.tsx`(서버 redirect)와 `fe/app/groups/[groupId]/GroupDetailClient.tsx`(쿠키 갱신)를 함께 봅니다. 쿠키 이름은 `fe/src/groups/lastGroupCookie.ts`에 정의.

### 23.7 BE 작업 시 기억할 컨벤션

- env는 루트 `.env.local`을 단일 source. fallback 금지. 누락 시 fail-fast.
- ORM은 TypeORM, `synchronize: false`. 스키마 변경은 `pnpm --filter be exec ... migration:generate`.
- 모든 timestamp는 UTC `timestamptz` 저장, KST 표시는 표시 단계에서만.
- 권한 체크는 `be/src/modules/groups/permissions.ts`의 `canPerform`을 단일 출입구로 사용.
- 단위 테스트는 구현과 동시에 작성하고 통과시킨 뒤 체크리스트 갱신.
