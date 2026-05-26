# Worker 작업 트랙

이 패키지는 deadline 임박 알림을 처리하는 백그라운드 워커입니다.
Redis BullMQ delayed job을 consume하고, Postgres에 알림을 저장한 뒤 Redis pub/sub으로 SSE fan-out 이벤트를 발행합니다.

## 로컬 실행

```bash
pnpm --filter worker dev
```

## Docker Compose

`docker compose up worker`로 실행합니다.
