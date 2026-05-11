# Worker 작업 트랙

이 패키지는 AI 분석, 문제 분석, deadline 임박 알림, 백그라운드 알림 처리를 담당합니다.

## 로컬 실행

```bash
pnpm --filter worker dev
```

## Docker Compose

`docker compose up worker`로 실행합니다.

현재는 큐 구현 전 placeholder이며, Redis와 Supabase Postgres 접속 환경변수를 받는 구조만 고정합니다.
