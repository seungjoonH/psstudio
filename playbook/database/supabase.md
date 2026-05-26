# Supabase 규칙

## 규칙
- Supabase는 Postgres 기반으로 다루고, 스키마 변경은 마이그레이션과 리뷰된 SQL로 관리한다.
- 외부 노출 테이블은 모두 RLS(Row Level Security)를 활성화하고 정책을 명시한다.
- service role 키는 신뢰된 서버 환경에서만 사용한다.

## Do
- 프론트엔드는 사용자 권한 키를 사용하고, service role은 백엔드 작업에만 제한한다.

## Don't
- 클라이언트 코드에서 권한이 높은 키로 RLS를 우회해 조회하지 않는다.

## 예시
```sql
alter table public.todos enable row level security;

create policy "users can read own todos"
on public.todos
for select
using (auth.uid() = user_id);
```

## 경계
- SQL 마이그레이션 계층이 스키마/정책 변경을 소유한다.
- 백엔드 계층이 service role 작업을 소유한다.
- 프론트엔드 계층은 사용자 범위 쿼리만 소유한다.

## 테스트 범위
- RLS 정책 allow/deny 경로 검증.
- 사용자 키와 service role 접근 회귀 검증.
