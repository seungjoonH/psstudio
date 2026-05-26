# PostgreSQL 규칙

## 규칙
- 모든 구조 변경은 명시적 마이그레이션으로 관리한다.
- 정규화 모델을 기본으로 하고, 조회 패턴 기준으로 인덱스를 설계한다.
- 다단계 정합성 변경은 트랜잭션 경계로 묶는다.

## Do
- 파라미터 바인딩 쿼리와 명시적 트랜잭션을 사용한다.

## Don't
- 운영 DB 콘솔에서 임의 스키마 변경을 직접 수행하지 않는다.

## 예시
```ts
await db.transaction(async (tx) => {
  const user = await tx.user.create({ data: input });
  await tx.auditLog.create({ data: { userId: user.id, action: "created" } });
});
```

## 경계
- 마이그레이션 계층은 스키마 진화를 소유한다.
- Repository는 SQL/쿼리 매핑을 소유한다.
- Service는 트랜잭션 범위를 결정한다.

## 테스트 범위
- 마이그레이션 up/down 검증.
- 핵심 쿼리의 실행계획/인덱스 사용 검증.
