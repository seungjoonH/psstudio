# Redis 규칙

## 규칙
- Redis는 캐시/세션/큐 용도로 사용하고 원본 저장소로 간주하지 않는다.
- 캐시 키는 기본 TTL을 가진다.
- 키 네이밍 규칙과 무효화 전략을 명시한다.

## Do
- `app:domain:id` 형태로 키를 네임스페이스화하고 TTL을 함께 기록한다.

## Don't
- 크기 제한 없는 대형 직렬화 데이터를 그대로 저장하지 않는다.

## 예시
```ts
const key = `app:user:${userId}`;
await redis.set(key, JSON.stringify(user), { EX: 300 });
```

## 경계
- Service는 캐시 가능 여부와 무효화 시점을 결정한다.
- Redis 계층은 키 규칙, TTL, 직렬화 포맷을 소유한다.

## 테스트 범위
- TTL 만료와 stale read 시나리오 검증.
- 쓰기 이후 무효화 동작 정확성 검증.
