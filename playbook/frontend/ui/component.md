# 컴포넌트 규칙

## 규칙
- 렌더링 로직과 상태 전이 로직을 분리한다.
- 컴포넌트 하나는 명확한 책임 하나만 가진다.
- 반복되는 UI 블록은 하위 컴포넌트나 훅으로 추출한다.

## Do
- JSX 반환 전에 계산 값과 핸들러를 미리 정리한다.

## Don't
- JSX 안에 복잡한 IIFE나 중첩 분기를 직접 넣지 않는다.

## 예시
```tsx
function ResultPanel({ items }: Props) {
  const visibleItems = items.filter((item) => item.visible);
  const isEmpty = visibleItems.length === 0;

  if (isEmpty) return <EmptyState />;
  return <ResultList items={visibleItems} />;
}
```

## 경계
- Page: 라우트 단위 데이터 조합과 화면 구성.
- Component: 렌더링과 로컬 상호작용.
- Hook: 재사용 가능한 상태 로직.

## 테스트 범위
- `empty`, `loading`, `data` 렌더링 상태를 검증한다.
- 이벤트-상태 전이 동작을 검증한다.
- 변경 완료 전 프론트 테스트 또는 최소 타입체크/린트를 반드시 수행한다.
