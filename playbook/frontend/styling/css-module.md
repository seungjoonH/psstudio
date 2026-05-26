# CSS Module 규칙

## 규칙
- 컴포넌트 스타일은 `*.module.css`에 둔다.
- 인라인 style 객체보다 클래스 토글을 우선한다.
- 클래스명은 컴포넌트 목적 중심으로 짓는다.
- 클래스 조합은 아래 `buildCls` 유틸을 사용한다.

## Do
- JSX 반환 전에 className을 계산한다.
- `src/lib/buildCls.ts`에 유틸을 두고 재사용한다.

## Don't
- 인자가 1개뿐이면 `buildCls`를 쓰지 않는다. 예: `buildCls(styles.root)` 금지, `className={styles.root}` 사용.

## 예시
```tsx
export function buildCls(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(" ").trim();
}

const className = buildCls(styles.root, isOpen && styles.open);
return <section className={className}>...</section>;
```

## 경계
- 컴포넌트 모듈은 해당 스타일시트를 소유한다.
- 글로벌 스타일은 reset/theme primitive만 둔다.

## 테스트 범위
- variant 클래스 토글을 검증한다.
- 주요 상태 시각 회귀를 검증한다.
- 변경 완료 전 프론트 테스트 또는 최소 타입체크/린트를 반드시 수행한다.
