// 저장소 루트의 과제 제출 코드 AI 비교 분석 리포트 예시 마크다운을 읽어 LLM 시스템 프롬프트에 넣습니다.
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

let cached: string | null = null;

/** `design/cohort-report-template.example.md` 전체(선두 HTML 주석 블록만 제거). 없으면 즉시 예외. */
export function readCohortReportStyleExampleMarkdown(): string {
  if (cached !== null) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "../../../../design/cohort-report-template.example.md");
  if (!existsSync(path)) {
    throw new Error(
      `코호트 리포트 스타일 예시 파일이 없습니다: ${path}. design/cohort-report-template.example.md 가 저장소에 있어야 합니다.`,
    );
  }
  let raw = readFileSync(path, "utf-8");
  raw = raw.replace(/^\s*<!--[\s\S]*?-->\s*/u, "").trimStart();
  cached = raw;
  return cached;
}
