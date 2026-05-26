# Next.js 스택

## 규칙
- 라우트 세그먼트는 작고 목적이 분명해야 한다.
- 기본은 Server Component, 필요한 부분만 Client Component로 전환한다.
- 데이터 패칭은 라우트 경계에 가깝게 둔다.

## Do
- 서버 계층에서 무거운 패칭을 수행하고 최소 props만 하위에 전달한다.

## Don't
- 작은 위젯 때문에 페이지 전체를 `"use client"`로 만들지 않는다.

## 예시
```tsx
// app/users/page.tsx
import { getUsers } from "@/server/users";
import { UserTable } from "./UserTable";

export default async function UsersPage() {
  const users = await getUsers();
  return <UserTable users={users} />;
}
```

## 경계
- Route/Page는 데이터 조합과 화면 구성을 담당한다.
- Client component는 상호작용 UI를 담당한다.
- Server module은 도메인 데이터 접근을 담당한다.

## 테스트 범위
- 라우트 렌더링과 metadata를 검증한다.
- 클라이언트 상호작용 동작을 검증한다.
- 변경 완료 전 프론트 테스트 또는 최소 타입체크/린트를 반드시 수행한다.
