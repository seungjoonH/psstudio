# Architecture (mermaid)

> `design/design.md` 확정 정책 기반의 1차 시스템 아키텍처입니다.

## 1. 시스템 개요

- Frontend: Next.js(App Router, Server Component 기본 + 필요한 Client Component)
- Backend: NestJS API
- DB: Supabase(PostgreSQL), Redis(캐시/큐/락)
- Local Infra: Docker Compose(`fe`, `be`, `worker`, `supabase`, `redis`)
- Deploy Infra: GCP 단일 GCE VM에 Docker Compose로 모노레포 통째 배포(FE/BE/Worker/Redis 동거), 앞단 Caddy reverse proxy + Cloudflare 무료 CDN/TLS, DB는 Supabase 매니지드(무료 티어 시작). 자세한 정책은 9장 참고.
- AI: 외부 LLM API(OpenRouter 또는 Requesty)로 문제 분석, AI 코드 리뷰, 과제 집단 코드 비교 분석을 비동기로 처리하고 토큰 차감 정책을 적용(제출 코드 기계 번역 파이프라인은 현재 두지 않음)
- Email: Resend API로 그룹 이메일 초대 메시지 발송(이메일은 그룹 초대 외 용도로 사용하지 않음)

## 1.1 로컬 Docker Compose 구성

로컬 개발의 기본 실행 단위는 다음 5개 논리 서비스입니다.

- `fe`: Next.js 개발 서버, 기본 포트 `3000`.
- `be`: NestJS API 서버, 기본 포트 `4000`.
- `worker`: AI 분석과 알림 백그라운드 작업.
- `supabase`: 로컬 개발용 Supabase Postgres 호환 DB, 호스트 포트 `54322`.
- `redis`: 큐, 작업 상태, 알림 카운트, 락, 호스트 포트 `6379`.

공식 Supabase 전체 로컬 스택은 내부 컨테이너가 많으므로 앱 Compose에 직접 포함하지 않습니다. Supabase Cloud 또는 Supabase CLI 스택을 사용할 때는 앱의 `DATABASE_URL`을 해당 환경으로 교체합니다.

### 1.2 로컬 DB·Redis 데이터 보존(초기화 방지)

앱은 ORM `synchronize: false`로 **자동 드롭/재생성을 하지 않습니다.** 데이터가 “날아가는” 경우는 대부분 **인프라·명령** 쪽입니다.

- **Docker 볼륨 삭제 금지(로컬 DB·세션)**: `docker compose down -v` 또는 `-v`가 붙는 down은 `supabase-data`·`redis-data` 볼륨을 지워 **Postgres·Redis 데이터가 통째로 사라집니다.** 볼륨을 유지하려면 `docker compose down`만 쓰거나, `-v` 없이 스택만 내립니다.
- **`DATABASE_URL` 고정**: `be/.env.local`의 DB 접속 URL을 바꾸면 “다른 빈 DB”에 붙는 것과 같아서 그룹·멤버십이 비어 보일 수 있습니다. 팀/기기 간에도 동일 인스턴스를 가리키는지 확인합니다.
- **마이그레이션 되돌리기**: `pnpm db:revert`는 스키마를 이전 마이그레이션 상태로 되돌립니다. 실수 방지를 위해 스크립트는 **`ALLOW_DB_REVERT=1`** 이 없으면 실행하지 않습니다. 정말 필요할 때만 `ALLOW_DB_REVERT=1 pnpm db:revert` 형태로 실행합니다.
- **Redis**: 세션은 Redis에만 있습니다. Redis 볼륨/데이터가 초기화되면 로그인만 풀리고, **그룹 데이터(Postgres)는 그대로**일 수 있습니다.

## 2. 상위 아키텍처 다이어그램

```mermaid
flowchart LR
    U[User Browser] --> FE[Next.js App]
    FE --> BE[NestJS API]

    BE --> PG[(Supabase Postgres)]
    BE --> RD[(Redis)]
    BE --> OAUTH[Google/GitHub OAuth]
    BE --> AIAPI[OpenRouter/Requesty LLM]
    BE --> EMAIL[Resend Email]

    BE --> NQ[BullMQ on Redis]
    NQ --> WK[Worker]
    WK --> PG
    WK --> RD
    WK --> AIAPI
    WK --> EMAIL
    WK --> EXTSITE[(External Problem Sites)]

    FE --> CDN[Static/Edge Runtime]
```

## 3. 레이어별 책임

### 3.1 Frontend (Next.js)

- 공개 마케팅 랜딩 `/landing`(인증 불필요, SEO 메타·JSON-LD, `psstudio.locale` 쿠키와 맞춘 메타·JSON-LD 언어, i18n 본문, `fe/app/landing/mock` 전용 CSS로 실제 화면과 스타일 분리)
- 그룹/과제/제출/리뷰/알림/캘린더 UI 렌더링
- 그룹 대시보드 UI 렌더링(기간 필터, 꺾은선 그래프, 원형 그래프, 멤버/과제 통계)
- OAuth 로그인 진입 및 세션 기반 사용자 상태 관리
- ThemeProvider로 `system`, `light`, `dark` 테마 적용
- I18nProvider로 한국어/영어 UI 문자열 제공
  - `t(key, vars)`는 `{key}` 형태의 변수 치환을 지원합니다(`fe/src/i18n/I18nProvider.tsx`).
  - `AppShell`은 `titleKey`/`titleVars`/`subtitleKey`/`subtitleVars` props로 서버 페이지에서도 키 기반 번역을 사용할 수 있게 합니다.
  - UI 문자열은 코드/플랫폼/언어 이름을 제외하고 모두 `t()`로 통과시킵니다(하드코딩 한국어 금지).
- 테마와 언어 선택은 localStorage에 저장
- 그룹 탭 라우팅
  - `/groups`는 화면을 그리지 않고 서버에서 즉시 `redirect`합니다.
  - 가입 그룹 0개 → `/groups/explore` (그룹 둘러보기). 1개 이상 → `psstudio_last_group` 쿠키의 그룹 ID(없으면 첫 그룹)로 이동.
  - 그룹 상세 진입 시 `psstudio_last_group` 쿠키와 `localStorage("psstudio:lastGroupId")`를 동시에 갱신합니다.
  - 헤더 우측 액션 슬롯(`AppShell.actions`)에 “그룹 추가” 모달과 “그룹 둘러보기” 링크 버튼을 둡니다.
  - “그룹 추가” 모달(`AddGroupModal`)은 새 그룹 만들기와 초대 코드 입력을 같이 노출합니다.
- diff 화면에서 현재 선택 버전 + 현재 버전 인라인 댓글만 표시
- 댓글·리뷰는 GitHub 스타일 공통 카드(`fe/src/ui/comments/CommentCard.tsx`)로 렌더링하고, 답글·이모지 반응을 동일하게 지원합니다.
- diff 인라인 리뷰 카드는 접기 가능하며, 접힌 상태에서는 작성자 아바타 칩과 답글 `+N` 카운트만 표시합니다.
- 다중 라인 범위 리뷰는 해당 new 라인 구간의 배경 음영(primary tint)만으로 시각화합니다(세로 strip 없음).
- 댓글 본문/마크다운 프리뷰의 fenced code block은 shiki로 토큰 단위 syntax highlighting을 적용합니다(`fe/src/ui/MarkdownCodeBlock.tsx`). 코드 블록 외곽 테두리는 한 겹으로 유지합니다.
- 모달 일관화
  - `fe/src/ui/Modal.tsx`/`Modal.module.css`를 표준으로 사용. 그라디언트/추가 그림자 없이 동일한 헤더·바디·푸터 패딩과 애니메이션을 사용합니다.
  - 삭제 확인은 `Modal` 푸터에 “취소(secondary) → 위험 액션(danger)” 순서를 유지합니다.
- 삭제 모달 표시 정책
  - 버튼 라벨 `삭제`
  - 과제 삭제 확인 문구 `삭제하시겠습니까?`

### 3.2 Backend (NestJS)

- 인증/인가(OWNER/MANAGER/MEMBER)
- 그룹/가입/과제/제출/리뷰/공지/커뮤니티 API
- Swagger UI와 OpenAPI JSON 제공(`/api-docs`, `/api-docs/json`)
- 그룹 규칙 단일 source(피드백 공개는 그룹원 모두 공개로 단순화)
- 그룹 코드 영구 토큰 + 그룹 코드 갱신 시 일괄 무효화
- 이메일 초대 1회용 토큰 발급 + Resend 호출
- 알림 이벤트 생성 및 읽음/삭제 처리
- AI 코드 리뷰/문제 분석 작업 큐 발행 및 결과 저장
- 과제 집단 코드 비교 분석(마감 후·과제당 1회 성공) 인-프로세스 파이프라인 및 `ASSIGNMENT_COHORT_ANALYSES`·`report_locale`·`artifacts`(제출별 `regions`만 저장, 원문 코드는 멤버의 `submission_version_id`로 조회해 응답 병합) 저장

### 3.3 Database (Supabase + Redis)

- Supabase: 트랜잭션 데이터 소스(권한, 과제, 제출, 리뷰, 알림, 게시판)
- Redis: 캐시, 큐, 분산락, 단기 집계 가속
- 알림은 TTL 없이 영구 보관(사용자 삭제 전)

### 3.4 Infra (Docker Compose 우선)

- Docker Compose: 로컬 개발 기본 실행 방식
- `fe`, `be`, `worker`, `supabase`, `redis` 5개 논리 서비스 유지
- Worker: AI 분석/재분석, 비동기 알림 후처리
- 장애 시 재시도/백오프 및 실패 알림 처리

## 4. 도메인 모듈 구조 (NestJS)

```mermaid
flowchart TD
    Auth[Auth Module]
    User[User Module]
    Group[Group Module]
    Invite[Invite Module]
    Email[Email Invite Module]
    Assignment[Assignment Module]
    Submission[Submission Module]
    Review[Review/Comment Module]
    AI[AI Code Review Module]
    CohortCompare[Assignment Cohort Analysis Module]
    Notification[Notification Module]
    Calendar[Calendar Module]
    Board[Announcement/Community Module]

    Auth --> User
    Group --> Invite
    Group --> Email
    Group --> Assignment
    Assignment --> Submission
    Submission --> Review
    Submission --> AI
    Assignment --> CohortCompare
    CohortCompare --> Submission
    AI --> Review
    AI --> Notification
    Email --> Notification
    Review --> Notification
    Assignment --> Calendar
    Board --> Notification
```

## 5. 핵심 시퀀스

### 5.1 OAuth 로그인

```mermaid
sequenceDiagram
    participant C as Client
    participant FE as Next.js
    participant BE as NestJS
    participant OP as OAuth Provider
    participant DB as Postgres

    C->>FE: OAuth 로그인 클릭
    FE->>BE: /api/v1/auth/oauth/:provider/start
    BE->>OP: OAuth 인증 리다이렉트
    OP-->>BE: callback(code, state)
    BE->>OP: token/user profile 조회
    BE->>DB: provider 기준 사용자 upsert
    Note over BE,DB: 동일 이메일이어도 provider 다르면 별도 사용자
    BE-->>C: httpOnly 세션 쿠키 + FE로 redirect
    Note over BE: 세션 payload는 Redis에 저장
    FE-->>C: 로그인 완료
```

### 5.2 AI 코드 리뷰(수동 트리거, GitHub Bot 흐름)

AI 코드 리뷰는 자동 트리거를 두지 않습니다. 제출 작성자, 그룹장, 그룹 관리자가 명시적으로 "AI 리뷰 요청" 버튼을 눌러야 시작됩니다.

```mermaid
sequenceDiagram
    participant C as Client
    participant BE as NestJS
    participant Q as BullMQ
    participant WK as Worker
    participant LLM as OpenRouter/Requesty
    participant DB as Postgres

    C->>BE: POST /submissions/:id/ai-review (수동 트리거)
    BE->>DB: AI_REVIEW_RUNS 행 생성 (status=PENDING)
    BE->>Q: ai-code-review job enqueue (submissionVersionId)
    WK->>Q: job consume
    WK->>LLM: 코드 + 프롬프트
    alt 호출 실패/타임아웃
        WK->>LLM: 자동 1회 재시도 (짧은 backoff)
        LLM-->>WK: 결과 또는 재실패
    else 정상 응답
        LLM-->>WK: 인라인 리뷰 + diff 제안 + 요약
    end
    WK->>DB: AI_REVIEW_RUNS 상태 갱신 (DONE | FAILED)
    WK->>DB: COMMENTS / REVIEWS 작성 (is_ai_bot=true, author=AI 튜터)
    Note over WK,DB: 같은 버전에 이전 봇 댓글이 있어도 자동 삭제하지 않고 누적
    WK->>DB: 토큰 차감 (성공 시 usage.total_tokens 그대로)
    WK->>DB: 제출 작성자 1명에게만 완료/실패 알림 생성
```

### 5.2.1 문제 URL 분석

```mermaid
sequenceDiagram
    participant C as Client
    participant BE as NestJS
    participant Q as BullMQ
    participant WK as Worker
    participant SITE as Problem Site
    participant LLM as OpenRouter/Requesty
    participant DB as Postgres

    C->>BE: POST /assignments/:id/problem-analysis
    BE->>Q: problem-analyze job enqueue
    WK->>SITE: HTTP GET problem_url
    alt 4xx/5xx/타임아웃/봇 차단
        SITE-->>WK: 비정상 응답
        WK->>DB: PROBLEM_ANALYSES.status=FAILED
        WK->>DB: 알림(수동 입력 안내)
    else 정상 HTML
        SITE-->>WK: HTML
        WK->>LLM: HTML + 프롬프트
        LLM-->>WK: 제목/플랫폼/난이도/태그
        WK->>DB: PROBLEM_ANALYSES 저장 + ASSIGNMENTS 메타 머지
    end
```

### 5.2.2 제출 코드 기계 번역(미구현)

`POST /submissions/:id/translations` 및 `SUBMISSION_TRANSLATIONS` 캐시 흐름은 설계에서 보류했습니다(`design/design.md` 5.4.4).

### 5.2.3 이메일 초대

```mermaid
sequenceDiagram
    participant M as Manager
    participant BE as NestJS
    participant DB as Postgres
    participant Q as BullMQ
    participant WK as Worker
    participant EM as Resend
    participant U as Invitee

    M->>BE: POST /groups/:id/email-invites (최대 20개 / 그룹당 1h 50건)
    BE->>DB: 같은 주소에 PENDING 토큰이 있으면 만료 처리
    BE->>DB: GROUP_EMAIL_INVITES 행 생성 (token, TTL 7d)
    BE->>Q: email-send job enqueue
    WK->>Q: job consume
    WK->>EM: 메일 발송 요청
    EM-->>U: 초대 메일

    U->>BE: POST /invites/email/:token/accept
    alt 미인증
        BE-->>U: /login?next=accept-url
        U->>BE: OAuth 로그인 후 재시도
    end
    BE->>DB: token 검증 + GROUP_MEMBERS 추가 + accepted_at 채움
    BE-->>U: 그룹 합류 완료
```

### 5.3 삭제와 알림 처리

```mermaid
sequenceDiagram
    participant C as Client
    participant BE as NestJS
    participant DB as Postgres

    C->>BE: 삭제 실행
    BE->>DB: 과제/제출/댓글/리뷰/AI 분석 결과 실삭제
    Note over BE,DB: 알림 데이터는 삭제하지 않음
    C->>BE: 기존 알림 클릭
    BE-->>C: "관련 페이지가 삭제되었습니다"
```

## 6. 권한 매트릭스 요약

- 그룹장
  - 그룹 삭제 가능
  - 그룹 코드 갱신 가능(그룹 관리자 불가)
  - 그룹 탈퇴 불가
  - 그룹장 위임 가능
  - AI 봇 댓글·리뷰 삭제 가능
- 그룹 관리자
  - 그룹 삭제·그룹 코드 갱신 제외 대부분 운영 권한
  - 가입 신청 승인/거절(승인 시점에 정원 가득이면 거부)
  - 이메일 초대 발송(rate limit 적용)
  - AI 봇 댓글·리뷰 삭제 가능
- 그룹원
  - 제출/댓글/리뷰
  - 직접 그룹 탈퇴 가능
  - 그룹 코드 노출(공유 가능, 가입 토글 켜져 있을 때만 실제 합류 가능)
  - AI 코드 리뷰 트리거는 본인 제출에 한정(또는 그룹장/그룹 관리자)

## 7. 성능/운영 기준

- 제출 코드 최대 200KB 입력 제한
- 검색 기본 정렬 deadline 임박순
- 알림 unread count 빠른 조회 인덱스 구성
- diff/리뷰 조회는 버전 기준으로 페이지네이션
- AI 실패 시 재시도 후 실패 알림 발송

## 8. 보안/감사 기준

- 그룹 가입은 그룹 코드(영구) 또는 1회용 이메일 초대 토큰 또는 가입 신청을 통해서만 가능합니다. 공개 검색·외부 노출은 없습니다.
- 그룹 코드 갱신 시 이전 코드와 그것으로 만들어진 초대 링크는 즉시 무효화되며, 무효화된 토큰 접근은 `404`로 통일합니다.
- 가입 방식 토글이 모두 꺼지면 어떠한 신규 가입도 발생하지 않습니다.
- 멘션 대상은 같은 그룹원으로 제한합니다.
- 관리자 삭제는 soft-hidden(`삭제된 댓글입니다`) 정책을 유지합니다.
- AI 봇이 작성한 댓글·리뷰는 그룹장/그룹 관리자만 삭제할 수 있습니다.
- 과제 삭제자는 별도로 기록하지 않습니다.
- 외부 LLM과 Resend로 전송되는 데이터는 분석/발송에 필요한 최소 범위로 제한합니다.

## 9. 운영 배포 (단일 GCE VM)

### 9.1 결정 사항

비용 최소화를 절대 기준으로 다음 구성을 운영 배포의 표준으로 확정합니다.

- 컴퓨트. GCP Compute Engine `e2-small`(2 vCPU burst, 2GB RAM) 1대, 리전 `asia-northeast3`(서울), 1년 약정(CUD) 적용.
- 컨테이너 오케스트레이션. Docker Compose로 `fe`, `be`, `worker`, `redis`, `caddy` 5개 서비스를 한 VM에서 실행합니다. 로컬 `docker-compose.yml`과 동일 구조의 `docker-compose.prod.yml`을 사용합니다.
- Reverse proxy. Caddy 컨테이너 1개가 외부 `443`을 받아 `/`는 `fe:3000`, `/api/*`는 `be:4000`으로 라우팅합니다. nginx는 사용하지 않습니다(설정 단순성과 TLS 자동화 때문).
- DNS / TLS / CDN. Cloudflare 무료 플랜이 DNS, TLS, CDN, DDoS 방어를 담당합니다. Caddy는 Cloudflare Origin Certificate로 origin TLS만 처리합니다. GCP Load Balancer는 사용하지 않습니다(고정비 회피).
- DB. Supabase 매니지드 무료 티어로 시작합니다. 500MB 한도 임박 시 Supabase Pro 또는 Neon으로 전환합니다. Cloud SQL은 사용하지 않습니다.
- Redis. VM 내부 컨테이너로만 운영합니다. Memorystore는 사용하지 않습니다. BullMQ 작업은 재시도로 복구되므로 단일 VM 로컬 Redis로 충분합니다.
- CI/CD. GitHub Actions에서 이미지 빌드 후 GitHub Container Registry(GHCR)로 push, SSH로 VM에 접속해 `docker compose pull && docker compose up -d`를 실행합니다.
- 시크릿. VM 내 `/etc/psstudio/.env.production`(권한 600) 파일을 단일 source로 사용합니다. 루트 `.env.local` SSOT 정책의 운영 대응이며, 키 누락 시 fail-fast 정책은 그대로 유지합니다.
- 백업. Supabase 자동 백업을 1차 백업으로 사용하고, 주 1회 `pg_dump` 결과를 GCS Coldline에 업로드합니다.

### 9.2 배포 토폴로지

```mermaid
flowchart LR
    U[User Browser] --> CF[Cloudflare Free<br/>DNS + TLS + CDN]
    CF --> VM[GCE e2-small<br/>asia-northeast3]
    subgraph VM_compose[Docker Compose on VM]
        CADDY[Caddy :443] -->|/| FE[fe Next.js :3000]
        CADDY -->|/api/*| BE[be NestJS :4000]
        WK[worker BullMQ]
        RD[(redis :6379<br/>VM 내부 전용)]
    end
    VM --> CADDY
    BE --> RD
    WK --> RD
    BE --> SB[(Supabase 무료 티어<br/>매니지드 Postgres)]
    WK --> SB
    BE --> AIAPI[OpenRouter / Requesty LLM]
    WK --> AIAPI
    BE --> EMAIL[Resend Email]
    WK --> EMAIL
    WK --> EXTSITE[(External Problem Sites)]
    BACKUP[GCS Coldline<br/>주 1회 pg_dump] -. 업로드 .- WK
```

### 9.3 비용 가이드

장기 운영 기준 월 예상 비용은 다음과 같습니다. egress 사용량에 따라 변동합니다.

| 항목 | 월 비용(USD) |
|---|---|
| GCE `e2-small` (1년 CUD) | ~8 |
| pd-balanced 20GB | ~2 |
| Egress 10~30GB | ~1~4 |
| Supabase 무료 티어 | 0 |
| Cloudflare 무료 | 0 |
| GitHub Actions / GHCR 무료 한도 | 0 |
| GCS Coldline 백업 1GB | ~0.5 |
| 합계 | ~12~15 |

### 9.4 운영 제약 / 한계

다음 항목은 단일 VM 구성의 명시적 제약입니다. 비용보다 우선해야 하는 요건이 생기면 9.5 전환 트리거를 따릅니다.

- 단일 장애점. VM 1대이므로 인스턴스 장애 시 전체 다운타임이 발생합니다. Cloudflare “Always Online” 캐시로만 부분 완화합니다.
- 무중단 배포 미지원. `docker compose up -d`는 짧은 다운타임을 허용합니다.
- 수평 확장 없음. vertical scale(`e2-small` → `e2-medium`/`e2-standard-*`)만 가능합니다.
- 리전 단일. 멀티 리전 페일오버는 제공하지 않습니다.

### 9.5 2단계 전환 트리거 (Cloud Run 분리)

다음 중 하나라도 만족하면 Cloud Run + Memorystore 구성으로 전환을 검토합니다.

- 동시 사용자 200명 이상이 일상화되거나 VM CPU 평균 70% 이상이 1주 이상 지속.
- 월 egress 100GB 초과.
- 무중단 배포가 비즈니스 요구가 됨.
- DB가 Supabase 무료 티어 한도를 초과하여 Pro 전환이 확정됨(이때 BE/Worker도 분리 검토).

### 9.6 도메인 / 환경 분리

- 단일 도메인 정책을 유지합니다(예: `app.psstudio.io`). FE/BE 도메인 분리는 하지 않습니다(OAuth 쿠키, CORS 단순성 유지).
- Vercel은 사용하지 않습니다. FE 별도 배포가 필요해지는 시점은 9.5의 전환 트리거에 포함합니다.
- 운영/스테이징은 VM을 추가하지 않고 동일 VM에 별도 Compose 프로젝트로 두는 것을 1차 안으로 합니다(필요 시 별도 VM으로 분리).
