# 보안 규칙

## 규칙
- 기본 정책은 deny-by-default로 설정한다.
- 인증/인가 실패는 명확한 상태코드와 로그를 남긴다.
- 비밀값은 코드/로그에 노출하지 않는다.

## Do
- 권한 체크를 라우트 가드/미들웨어에서 먼저 수행한다.

## Don't
- 토큰, 키, 비밀번호를 평문으로 저장하거나 로그에 출력하지 않는다.

## 예시
```ts
app.get("/v1/admin/users", requireAuth, requireRole("admin"), async (_req, res) => {
  const users = await userService.list();
  res.json({ data: users });
});

function maskSecret(value: string) {
  return `${value.slice(0, 2)}***`;
}
logger.info("external_key", { key: maskSecret(process.env.EXTERNAL_KEY ?? "") });
```

## 경계
- Gateway/Middleware는 인증/인가를 담당한다.
- Application 계층은 권한이 검증된 요청만 처리한다.
- Secret 저장/로테이션은 인프라 계층에서 담당한다.

## 테스트 범위
- 인가 실패(`401/403`) 경로를 검증한다.
- 시크릿 마스킹/로그 비노출을 검증한다.
