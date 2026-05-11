# BE Phase 2 작업 트랙

이 문서는 Phase 2 인증/사용자 구현의 BE 진행 기준입니다.

## 목표

- OAuth 시작/콜백 API 제공.
- provider 기준 사용자 분리 저장 규칙 반영.
- `GET /users/me`, `PATCH /users/me`, `DELETE /users/me` 구현.

## 고정 정책

- OAuth만 지원합니다.
- 동일 이메일이라도 provider가 다르면 별도 사용자입니다.
- 닉네임 기본값은 provider 표시명이고 수정 가능합니다.
- 닉네임 중복 허용입니다.
- 로그인 시마다 프로필 이미지 동기화합니다.
- 사용자 탈퇴는 해당 OAuth 계정에만 적용합니다.

## 작업 루프

- todo 확인 -> 구현 -> 테스트 -> todo 했음 체크
- todo 확인 -> 구현 -> 테스트 -> todo 했음 체크
