// CSS Module 클래스 이름 조합을 담당하는 유틸입니다.
export function buildCls(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(" ").trim();
}
