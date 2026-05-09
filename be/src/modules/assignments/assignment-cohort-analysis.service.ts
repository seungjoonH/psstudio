// 과제 집단 코드 비교 분석 트리거·파이프라인·조회를 담당하는 서비스입니다.
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { type DataSource, In, IsNull } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { Submission } from "../submissions/submission.entity.js";
import { SubmissionVersion } from "../submissions/submission-version.entity.js";
import { User } from "../users/user.entity.js";
import { Assignment } from "./assignment.entity.js";
import { AssignmentCohortAnalysisMember } from "./assignment-cohort-analysis-member.entity.js";
import { AssignmentCohortAnalysis } from "./assignment-cohort-analysis.entity.js";
import {
  assertCohortAnalysisRerunAllowed,
  assertCohortAnalysisTriggerAllowed,
} from "./assignment-cohort-analysis.policy.js";
import {
  type CohortAnalysisArtifactsDto,
  type CohortAnalysisArtifactsPublicDto,
  type CohortLlmBundleParsed,
  type CohortReportLocale,
  parseAndValidateCohortBundle,
} from "./cohort-analysis-bundle.js";
import { fetchProblemPromptFromUrl } from "./problem-prompt-from-url.js";

/** 리포트·번들 생성은 문제 메타 추론과 동일한 모델 키를 씁니다(추가 env 없음). */
const COHORT_REPORT_MODEL = () => ENV.llmModelProblemAnalyze();

/** DB 원문과 동일한 규칙으로 줄 배열을 만듭니다(regions 줄 번호·검증과 일치). */
function submissionCodeToLines(code: string): string[] {
  if (code.length === 0) return [""];
  return code.split("\n");
}

async function openRouterCompletion(
  messages: { role: "system" | "user"; content: string }[],
  model: string,
  temperature: number,
): Promise<{ text: string; tokens: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.llmApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 32768,
    }),
  });
  if (!response.ok) {
    throw new Error(`openrouter_http_${response.status}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  const tokens = typeof body.usage?.total_tokens === "number" ? body.usage.total_tokens : 0;
  return { text, tokens };
}

function cohortLocaleInstruction(locale: CohortReportLocale): string {
  if (locale === "en") {
    return [
      "Write reportMarkdown and every roleLabel in natural English.",
      "Use a friendly explanatory tone suitable for young learners.",
      "Do not write Korean prose headings or body paragraphs in reportMarkdown when this locale is English.",
      "Do not add a separate \"Submission summary\" section; identify each submission inline with [[SUBMISSION:id]] where the reader needs it, not only by language name (avoid \"In the JavaScript submission…\" as the primary signal).",
      "After `[[SUBMISSION:id]]`, do not start a new line before the rest of the sentence (e.g. no orphan \": language submission\" on the next line). Keep the placeholder and the following words on the same line so the tag and prose render together.",
      "For cohort `regions`: if a submission's code has **12+ lines**, output **2–5** distinct snake_case roleIds per submission, never `entire_code` or one region covering the full file; same roleId set and count on every submission.",
      "Ground every comparison in the provided `problemContext` (and codes): restate what the task asks, then explain similarities and differences **between submissions** (pairs, contrasts, and when there are 3+ submissions a paragraph tying several [[SUBMISSION:id]] together). Do not only walk submissions one-by-one in order.",
      "Structure reportMarkdown as a **real report**: use `#` once for the document title, `##` / `###` for sections and subsections (e.g. per comparison axis / roleId). **Do not** title sections \"overview\", \"summary\", \"cross-submission overview\", or \"problem summary\" — use concrete axis names instead. Use bullets, bold key phrases, and fenced code so a reader can skim headings and still follow.",
    ].join(" ");
  }
  return [
    "reportMarkdown 전체(제목·소제목·본문·목록·표 설명·코드 펜스 바깥 문장)는 한국어로만 작성한다. 영어만으로 된 장문 설명이나 영어 제목만 있는 절은 쓰지 않는다.",
    "함수명·API 이름 등 코드 식별자는 원문을 남겨도 되지만, 그 전후 서술은 한국어이다.",
    "각 regions의 roleLabel도 한국어 짧은 이름으로 작성한다.",
    "문체는 합니다·입니다체를 쓰고, 중학생도 이해할 수 있게 짧은 문장으로 설명한다.",
    "제출을 구별할 때 언어명만으로 서술하지 말고 문장 속에 [[SUBMISSION:id]]를 넣어 칩으로 보이게 한다.",
    "`[[SUBMISSION:uuid]]` 바로 뒤에는 줄바꿈·공백·`<br />`를 두지 않는다. 반드시 `[[SUBMISSION:uuid]]의`, `[[SUBMISSION:uuid]]에서는`, `[[SUBMISSION:uuid]]의 time_adjust`처럼 닫는 `]]` 직후 한글 또는 백틱이 붙는다. 조사 `의`만 다음 줄에 단독으로 오게 쓰면 실패다.",
    "코드 펜스를 **`다음과 같습니다`, `코드 발췌는 다음과 같습니다`, `발췌는 다음과 같습니다`, `이 부분은 다음과 같습니다`, `코드의 일부는 다음과 같습니다`, `그냥 이 부분은 다음과 같습니다` 같은 상투구로 소개하지 않는다.** 필요하면 역할 한 줄만 짚고 바로 펜스를 둔다. 시간 표기·코드 안의 `:`·마크다운 링크 문법은 그대로 둔다.",
    "집단 `regions`: 제출 code가 **12줄 이상**이면 제출마다 **2~5개** 서로 다른 snake_case roleId, **`entire_code`/전 파일 한 구역 금지**; 모든 제출에 **동일한** roleId 집합·개수.",
    "반드시 입력에 포함된 `problemContext`(및 코드)를 근거로 서술한다. 문제가 요구하는 것을 짚은 뒤, 제출 **간** 유사점·차이를 서술한다. 한 제출씩 순서만 도는 나열로 끝내지 않고, 두 제출 쌍 비교·대조, 제출이 세 개 이상이면 여러 [[SUBMISSION:id]]를 묶은 한 문단 요약을 포함한다.",
    "보고서 형식으로 작성한다. `#` 문서 제목 1개, `##`·`###`으로 계층을 나누되 **`##`/`###` 제목에 「개요」「요약」「비교 개요」「문제 요약」 같은 뜬금없는 꼭지 이름은 쓰지 않는다**(도입·정리는 평문이거나 구체적인 축 이름으로만). 목록·굵게 표시·코드 펜스를 적극 쓴다.",
  ].join(" ");
}

/** 집단 리포트 마크다운의 목차·코드 인용 규칙(로케일별 문구). */
function cohortMarkdownStructureAndCodeRules(locale: CohortReportLocale): string[] {
  if (locale === "en") {
    return [
      "",
      "[reportMarkdown — document structure (required)]",
      "- Build a **readable report**: use `#` **once** for the document title, `##` for major sections, `###` for subsections. Do not chain long plain paragraphs without headings.",
      "- **Paragraph spacing:** Prefer **blank lines** between paragraphs (Markdown paragraphs). **Optionally** insert `<br /><br />` **once between two logical paragraphs** where extra breathing room helps — **never** after every sentence or every line.",
      "- Suggested flow (heading **wording** must be concrete — **never** use vague labels like \"Overview\", \"Summary\", \"Problem summary\", \"Cross-submission overview\"):",
      "  - `#` One-line title for this cohort comparison (reflect the assignment).",
      "  - Opening: **without** a fake \"overview\" heading — either one or two plain paragraphs grounded in `problemContext`, or go straight to per-axis sections.",
      "  - `##` / `###` named by **what you compare** (e.g. time adjustment, main loop, data structure) — for **each comparison axis**, `###` with `roleLabel`/roleId in the heading; inside, **fenced excerpts + explanation** for that span.",
      "  - Optional short closing in plain prose — **no** \"Summary\" section title.",
      "- With many submissions, repeat `###` per axis; do not cram all code discussion under one `##`.",
      "- Use `-` or numbered lists for enumerations; avoid comma-only lists in a single sentence.",
      "- **Bold** key differences: complexity, data structures, edge handling.",
      "- Markdown **tables** are allowed when they clarify constraints or side-by-side facts (separate fact from speculation).",
      "",
      "[reportMarkdown — code excerpts & comparison (required)]",
      "- Ground comparisons in **actual code**. Use fenced blocks with the correct language tag (python, javascript, java, …). No excerpt-only vague prose.",
      "- Before each fence, say which **[[SUBMISSION:id]]**, **`roleId`**, and **line range** the snippet comes from. Snippets must **match** the submission source lines exactly — no rewriting.",
      "- Do **not** use filler like \"as follows:\", \"the code below:\", \"the excerpt is as follows\", or Korean equivalents (`다음과 같습니다`, `코드 발췌는 다음과 같습니다`, `발췌는 다음과 같습니다`, `이 부분은 다음과 같습니다`) before a fence — give source context in one concrete sentence or start the fence directly after a blank line.",
      "- When contrasting two submissions, place **two fences back-to-back** or one short fence with clear comments so the **diff** is visible. Prefer pairing the **same roleId** across submissions.",
      "- Never paste a **full file**. Use several short contiguous excerpts if needed.",
      "- Forbidden: long abstract comparison without fences, repeating the same point, listing identifiers without a fence.",
      "",
      "[problem text — internal context only]",
      "- `problemContext` is for **analysis accuracy**; the app does **not** show raw scraped problem text to users. In `reportMarkdown`, do **not** reproduce long verbatim problem statements from external sites; **summarize** what the task requires in your own short prose.",
    ];
  }
  return [
    "",
    "[reportMarkdown — 문서 구조·가독성(필수)]",
    "- 독자가 **제목만 훑어도 흐름을 파악**할 수 있게 `#`(문서 제목·**문서당 1회**), `##`(큰 절), `###`(하위 절)로 **계층을 분명히** 나눈다. 평문만 길게 이어 붙이지 않는다.",
    "- **문단 간 호흡:** 한 덩어리 설명이 끝나면 **빈 줄 한 줄**로 다음 문단과 구분한다. 필요하면 `<br /><br />`를 **문단 사이에 한 번만** 쓴다. **문장마다 `<br />` 금지.**",
    "- **제출 칩(`[[SUBMISSION:…]]`) 붙임:** 닫는 `]]` 바로 뒤에 공백 없이 한글이 와야 한다. `]]` 다음 줄에 `의`가 단독으로 오게 쓰지 않는다.",
    "- **`다음과 같습니다` 류 금지:** 펜스 직전에 `다음과 같습니다`, `코드 발췌는 다음과 같습니다`, `발췌는 다음과 같습니다`, `아래 코드는 다음과 같습니다`, `이 부분은 다음과 같습니다`, `코드의 일부는 다음과 같습니다` 등을 **쓰지 않는다.** 출처 한 줄(`[[SUBMISSION:id]]의 … 줄`)만 쓰거나 바로 펜스를 둔다.",
    "- 권장 흐름(절 이름은 **구체적으로** 짓는다. **`##`/`###` 제목에 「개요」「요약」「비교 개요」「문제 요약」「마무리」만 덩그러니 쓰는 것은 금지** — 읽는 사람이 스킵할 만한 뜬금없는 꼭지를 만들지 않는다):",
    "  - `#` … 이번 집단 비교의 한 줄 제목(과제 맥락이 드러나게).",
    "  - 도입: **`##` 없이** 평문 1~2문단으로 과제 맥락·입출력을 짧게 짚거나, 곧바로 아래 축별 절로 들어간다(여기서 [[SUBMISSION:id]]로 페어·그룹 유사·차이를 말해도 된다).",
    "  - `##` 또는 `###` **역할(roleId)별·비교 축별** 제목 — 각 축의 `roleLabel`/roleId를 제목에 넣고, 그 구역의 **펜스 발췌 + 차이 설명**을 묶는다.",
    "  - 필요하면 마지막에 평문 한두 문단으로 요지를 짚되, **`## 요약` 같은 제목은 붙이지 않는다.**",
    "- 제출이 많으면 `###`을 역할 축마다 반복해도 된다. 한 `##` 안에 모든 코드 논의를 몰아넣지 않는다.",
    "- 목록: 조건·차이점 나열은 `-` 또는 `1.` **목록**으로 쓴다. 한 문단에 쉼표만으로 여러 항목을 잇지 않는다.",
    "- 강조: 핵심 차이·주의할 조건·복잡도·자료구조 선택은 **굵게** 표시한다.",
    "- 표: 입력 크기·경계 조건 등을 나란히 보여 주면 이해에 도움이 될 때 **마크다운 표**를 써도 된다(사실과 추측을 구분한다).",
    "",
    "[reportMarkdown — 코드 인용·비교 서술(필수)]",
    "- 실제 코드를 근거로 비교한다. 추상적인 말만 하지 않고, **마크다운 코드 펜스**로 발췌를 넣는다. 언어 태그는 해당 제출 `language`·발췌에 맞춘다(python, javascript, java 등).",
    "- 각 펜스 **앞** 문장에서 \"[[SUBMISSION:id]]의 `roleId`(몇~몇 줄)\"처럼 출처를 밝힌다. 펜스 안 코드는 해당 제출 **`lines` 원문**과 **동일**해야 하며 임의로 변형하지 않는다.",
    "- 두 제출을 대조할 때는 펜스를 **연속 두 개** 두거나, 한 펜스 안에 짧은 주석으로 구분해 **차이가 보이게** 한다. 가능하면 같은 역할 축(roleId)끼리 짝을 지어 서술한다.",
    "- 발췌는 **전체 파일을 붙이지 않는다.** 대신 핵심 루프·분기·자료구조 선언 등 **짧은 연속 줄**을 여러 번 인용해도 된다.",
    "- 금지: 코드 없이 일반론만 장황하게 쓰기, 동일 내용 반복, 펜스 없이 식별자만 나열하기.",
  ];
}

/** user 메시지 끝에 붙여 regions 계약을 한 번 더 각인합니다. */
function cohortUserRegionsContractReminder(locale: CohortReportLocale): string {
  if (locale === "en") {
    return [
      "",
      "---",
      "Before you output JSON: each submission has a **`lines` array**. **Line numbers are 1-based indices into `lines`** (line k is `lines[k-1]`). N = `lines.length`.",
      "- **Under 12 lines**: 1–5 regions OK.",
      "- **12+ lines**: **2–5** regions per submission, **distinct** snake_case `roleId`. Never `entire_code` / `whole_file` / a **single** region from line 1 through the last line. Split by real comparison themes (time normalization, weekday filter, main simulation loop, parse/I/O, etc.).",
      "- Each region = **one** inclusive contiguous [startLine,endLine]; include **every** blank line and brace inside that span (no striping).",
      "- **Identical** roleId set and **same** region count k on **every** submission.",
      "- **Main/simulation loop**: the span **must include** the line with `for` / `while` / `do` / `forEach` — not only tails after `break`, closing braces alone, or helper nested functions (`def convert`, inner `function`) above the outer simulation loop without that loop header.",
    ].join("\n");
  }
  return [
    "",
    "---",
    "JSON을 출력하기 **직전**에 각 제출 **`lines` 배열 길이**를 센다(줄 번호는 **`lines` 기준 1-based**, k번째 줄=`lines[k-1]`).",
    "- **12줄 미만**: regions 1~5개.",
    "- **12줄 이상**: 제출마다 regions **2~5개**, 서로 다른 **snake_case** roleId. **`entire_code`/`whole_file`/1행~마지막행을 한 구역으로만 덮기 금지.** 시간 보정·평일 필터·메인 루프·입출력 등 **실제 비교 축**으로 나눈다.",
    "- region은 연속 [startLine,endLine] **한 덩어리**; 그 안의 **빈 줄·주석·`}`·`break`**까지 포함(줄무늬 금지).",
    "- 모든 제출에 **동일한** roleId 집합·**같은** k.",
    "- **주요 루프·시뮬레이션**: 구간 안에 **`for`/`while`/`do`/`forEach`가 있는 줄**이 반드시 포함되어야 한다. **`def convert`/중첩 헬퍼 블록 전체**를 메인 루프 축에 묶지 말고 시간 보정 등 다른 축 또는 미색으로 둔다. 닫는 꼬리·함수 선언부만 칠하지 마라.",
  ].join("\n");
}

export type CohortAnalysisPublicDto = {
  status: "NONE" | "RUNNING" | "DONE" | "FAILED";
  reportLocale?: string | null;
  failureReason?: string | null;
  reportMarkdown?: string | null;
  artifacts?: CohortAnalysisArtifactsPublicDto | Record<string, unknown>;
  tokenUsed?: number;
  includedSubmissions?: Array<{
    submissionId: string;
    versionNo: number;
    authorUserId: string;
    authorNickname: string;
    title: string;
    authorProfileImageUrl: string;
  }>;
  startedAt?: string | null;
  finishedAt?: string | null;
};

function cohortPipelineFailureReason(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  if (code === "cohort_bundle_parse_failed") {
    return "모델 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_report_missing") {
    return "모델이 비교 리포트를 만들지 못했습니다. 다시 시도해 주세요.";
  }
  if (code.startsWith("openrouter_http_")) {
    return "AI 서비스 요청이 거절되었습니다. API 키·크레딧·네트워크를 확인해 주세요.";
  }
  if (
    code === "cohort_bundle_submission_count_mismatch" ||
    code === "cohort_bundle_missing_submission" ||
    code === "cohort_bundle_unknown_submission" ||
    code === "cohort_bundle_duplicate_submission"
  ) {
    return "모델 응답에 제출 목록이 올바르게 포함되지 않았습니다. 다시 시도해 주세요.";
  }
  if (code === "assignment_missing" || code === "submissions_too_few" || code === "version_missing") {
    return "과제 또는 제출 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_code_empty") {
    return "제출 코드가 비어 있어 비교할 수 없습니다.";
  }
  if (code === "cohort_bundle_regions_count") {
    return "모델이 구역(regions) 개수 규칙(제출당 1~5개)을 지키지 못했습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_role_mismatch") {
    return "제출 간 구역 수·범위를 자동으로 맞출 수 없었습니다(모델이 제출마다 roleId·개수를 크게 다르게 주었을 수 있음). 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_too_fine") {
    return "모델이 코드를 너무 잘게 나눈 구역을 반환했습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_reserved_role") {
    return "모델이 사용할 수 없는 구역 식별자를 썼습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_duplicate_role") {
    return "모델이 한 제출 안에서 roleId를 중복했습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_semantic_required") {
    return "모델이 코드 전체 한 덩어리(entire_code)로만 칠하거나, 긴 코드에서 비교 축을 한 개만 두었습니다. 함수·루프·핵심 로직 등 2~5개 축으로 나눠 다시 생성해야 합니다. 분석을 다시 실행해 주세요.";
  }
  return "집단 코드 비교 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function mergeArtifactsWithVersions(
  artifacts: CohortAnalysisArtifactsDto,
  members: AssignmentCohortAnalysisMember[],
  versions: SubmissionVersion[],
): CohortAnalysisArtifactsPublicDto {
  const verById = new Map(versions.map((v) => [v.id, v]));
  const memberBySubmissionId = new Map(members.map((m) => [m.submissionId, m]));
  return {
    submissions: artifacts.submissions.map((s) => {
      const m = memberBySubmissionId.get(s.submissionId);
      const v = m !== undefined ? verById.get(m.submissionVersionId) : undefined;
      return {
        submissionId: s.submissionId,
        regions: s.regions,
        code: v?.code ?? "",
        language: v?.language ?? "",
      };
    }),
  };
}

@Injectable()
export class AssignmentCohortAnalysisService {
  private readonly logger = new Logger(AssignmentCohortAnalysisService.name);

  private get ds(): DataSource {
    return dataSource;
  }

  async getForAssignment(assignmentId: string): Promise<CohortAnalysisPublicDto> {
    const row = await this.ds.getRepository(AssignmentCohortAnalysis).findOne({
      where: { assignmentId },
    });
    if (row === null) {
      return { status: "NONE" };
    }
    return this.serializeRow(row);
  }

  private async serializeRow(row: AssignmentCohortAnalysis): Promise<CohortAnalysisPublicDto> {
    const base: CohortAnalysisPublicDto = {
      status: row.status,
      reportLocale: row.reportLocale,
      failureReason: row.failureReason,
      reportMarkdown: row.reportMarkdown,
      tokenUsed: row.tokenUsed,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
    if (row.status === "DONE") {
      const stored = row.artifacts as unknown as CohortAnalysisArtifactsDto;
      const members = await this.ds.getRepository(AssignmentCohortAnalysisMember).find({
        where: { cohortAnalysisId: row.id },
      });
      if (members.length === 0) {
        base.artifacts = { submissions: [] };
        base.includedSubmissions = [];
      } else {
        const submissionIds = members.map((m) => m.submissionId);
        const versionIds = members.map((m) => m.submissionVersionId);
        const subs = await this.ds.getRepository(Submission).find({ where: { id: In(submissionIds) } });
        const subById = new Map(subs.map((s) => [s.id, s]));
        const vers = await this.ds.getRepository(SubmissionVersion).find({ where: { id: In(versionIds) } });
        const verNoById = new Map(vers.map((v) => [v.id, v.versionNo]));
        const authorIds = [...new Set(subs.map((s) => s.authorUserId))];
        const users = authorIds.length > 0 ? await this.ds.getRepository(User).find({ where: { id: In(authorIds) } }) : [];
        const nick = new Map(users.map((u) => [u.id, u.nickname]));
        const profile = new Map(users.map((u) => [u.id, u.profileImageUrl]));
        base.includedSubmissions = members.map((m) => {
          const s = subById.get(m.submissionId);
          const author = s?.authorUserId ?? "";
          return {
            submissionId: m.submissionId,
            versionNo: verNoById.get(m.submissionVersionId) ?? 0,
            authorUserId: author,
            authorNickname: nick.get(author) ?? "",
            title: s?.title ?? "",
            authorProfileImageUrl: profile.get(author) ?? "",
          };
        });
        base.artifacts = mergeArtifactsWithVersions(stored, members, vers);
      }
    }
    return base;
  }

  async trigger(
    assignmentId: string,
    userId: string,
    reportLocale: CohortReportLocale,
    options?: { rerun?: boolean },
  ): Promise<CohortAnalysisPublicDto> {
    const assignment = await this.ds.getRepository(Assignment).findOne({ where: { id: assignmentId } });
    if (assignment === null || assignment.deletedAt !== null) {
      throw new NotFoundException("과제를 찾을 수 없습니다.");
    }
    const submissionCount = await this.ds.getRepository(Submission).count({
      where: { assignmentId, deletedAt: IsNull() },
    });
    const existing = await this.ds.getRepository(AssignmentCohortAnalysis).findOne({
      where: { assignmentId },
    });
    const existingMeta = existing !== null ? { status: existing.status } : null;

    if (options?.rerun === true) {
      assertCohortAnalysisRerunAllowed({
        dueAt: assignment.dueAt,
        now: new Date(),
        submissionCount,
        existing: existingMeta,
      });
      if (existing !== null) {
        await this.ds.getRepository(AssignmentCohortAnalysis).delete({ assignmentId });
      }
      const row = this.ds.getRepository(AssignmentCohortAnalysis).create({
        assignmentId,
        status: "RUNNING",
        reportLocale,
        triggeredByUserId: userId,
        tokenUsed: 0,
        reportMarkdown: null,
        artifacts: {},
        failureReason: null,
        startedAt: new Date(),
        finishedAt: null,
      });
      await this.ds.getRepository(AssignmentCohortAnalysis).save(row);
      void this.runPipeline(row.id).catch(() => {
        /* runPipeline 내부에서 FAILED 기록 */
      });
      const refreshed = await this.ds.getRepository(AssignmentCohortAnalysis).findOneOrFail({
        where: { id: row.id },
      });
      return this.serializeRow(refreshed);
    }

    assertCohortAnalysisTriggerAllowed({
      dueAt: assignment.dueAt,
      now: new Date(),
      submissionCount,
      existing: existingMeta,
    });

    let row: AssignmentCohortAnalysis;
    if (existing === null) {
      row = this.ds.getRepository(AssignmentCohortAnalysis).create({
        assignmentId,
        status: "RUNNING",
        reportLocale,
        triggeredByUserId: userId,
        tokenUsed: 0,
        reportMarkdown: null,
        artifacts: {},
        failureReason: null,
        startedAt: new Date(),
        finishedAt: null,
      });
      await this.ds.getRepository(AssignmentCohortAnalysis).save(row);
    } else {
      existing.status = "RUNNING";
      existing.reportLocale = reportLocale;
      existing.triggeredByUserId = userId;
      existing.tokenUsed = 0;
      existing.reportMarkdown = null;
      existing.artifacts = {};
      existing.failureReason = null;
      existing.startedAt = new Date();
      existing.finishedAt = null;
      await this.ds.getRepository(AssignmentCohortAnalysis).save(existing);
      row = existing;
    }

    void this.runPipeline(row.id).catch(() => {
      /* runPipeline 내부에서 FAILED 기록 */
    });

    const refreshed = await this.ds.getRepository(AssignmentCohortAnalysis).findOneOrFail({
      where: { id: row.id },
    });
    return this.serializeRow(refreshed);
  }

  private async runPipeline(analysisId: string): Promise<void> {
    let analysis: AssignmentCohortAnalysis | null = null;
    try {
      analysis = await this.ds.getRepository(AssignmentCohortAnalysis).findOne({ where: { id: analysisId } });
      if (analysis === null || analysis.status !== "RUNNING") return;

      const assignment = await this.ds.getRepository(Assignment).findOne({ where: { id: analysis.assignmentId } });
      if (assignment === null || assignment.deletedAt !== null) {
        throw new Error("assignment_missing");
      }
      const submissions = await this.ds.getRepository(Submission).find({
        where: { assignmentId: assignment.id, deletedAt: IsNull() },
        order: { id: "ASC" },
      });
      if (submissions.length < 2) {
        throw new Error("submissions_too_few");
      }

      const versionRows: { submission: Submission; version: SubmissionVersion }[] = [];
      for (const sub of submissions) {
        const version = await this.ds.getRepository(SubmissionVersion).findOne({
          where: { submissionId: sub.id, versionNo: sub.currentVersionNo },
        });
        if (version === null) {
          throw new Error("version_missing");
        }
        versionRows.push({ submission: sub, version });
      }

      const authorIds = [...new Set(versionRows.map((v) => v.submission.authorUserId))];
      const authors =
        authorIds.length > 0 ? await this.ds.getRepository(User).find({ where: { id: In(authorIds) } }) : [];
      const nickByUserId = new Map(authors.map((u) => [u.id, u.nickname]));

      const reportLocale: CohortReportLocale =
        analysis.reportLocale === "en" || analysis.reportLocale === "ko" ? analysis.reportLocale : "ko";

      const codeBySubmissionId = new Map(versionRows.map(({ submission, version }) => [submission.id, version.code]));

      const problemContext = await fetchProblemPromptFromUrl(assignment.problemUrl.trim());

      const bundleInput = {
        assignmentTitle: assignment.title,
        problemUrl: assignment.problemUrl,
        problemContext,
        reportLocale,
        submissions: versionRows.map(({ submission, version }) => {
          const lines = submissionCodeToLines(version.code);
          return {
            submissionId: submission.id,
            lineCount: lines.length,
            lines,
            title: submission.title,
            authorNickname: nickByUserId.get(submission.authorUserId) ?? "",
            versionNo: submission.currentVersionNo,
            language: version.language,
          };
        }),
      };

      const systemPrompt = [
        "너는 스터디 그룹 과제에서 여러 멤버가 제출한 **원문 코드**를 같은 과제 안에서 나란히 비교한다.",
        "출력은 반드시 유효한 JSON 객체 한 개만이다. 앞뒤 설명·마크다운 코드펜스로 감싸지 않는 것이 좋다(순수 JSON).",
        '키: "reportMarkdown"(string), "submissions"(배열).',
        "",
        "[★ 최우선 — regions 출력 계약. 이걸 먼저 맞춘 뒤 reportMarkdown을 쓴다]",
        "1) `submissions[]`에 입력의 **모든** submissionId를 빠짐없이 넣는다. 각 원소는 `submissionId`, `regions`만.",
        "2) 각 제출의 **`lines` 배열 길이가 N**이다(= 원문을 `\\n`으로 나눈 줄 수와 동일). **regions의 startLine/endLine은 항상 이 `lines` 기준 1-based이다.** k번째 줄의 텍스트는 **`lines[k-1]`** 이다. 입력에 단일 `code` 문자열은 없다 — 줄 위치 판단은 **`lines`만** 따른다.",
        "3) **N < 12** 이면 regions는 1~5개(한 구역으로도 가능). **N ≥ 12** 이면 regions는 **반드시 2~5개**이고, **서로 다른** `roleId`(짧은 snake_case 권장, 예: `time_adjust`, `weekday_filter`, `main_loop`).",
        "4) **N ≥ 12** 일 때 **금지**: `roleId`가 `entire_code` 이거나 라벨이 「코드 전체」「Full program」; **구역이 1개뿐**이면서 `startLine=1`·`endLine=N`으로 전 파일을 덮는 것; `whole_file` 식별자.",
        "5) 각 region은 **연속 구간** `[startLine,endLine]`(포함) **정확히 하나**. 그 사이의 코드·빈 줄·주석·`}`·`break`/`continue`를 **빠짐없이** 포함한다(같은 블록 안 줄무늬 금지).",
        "6) **모든 제출**에서 **동일한** roleId 집합과 **같은 개수** k의 regions를 둔다(제출마다 줄 범위는 달라도 된다).",
        "",
        "[regions 올바른 형태 예 — 구조만 참고, 줄 번호는 해당 제출 `lines`에 맞출 것]",
        '예: 한 제출 `lines` 길이가 40일 때 `{"submissionId":"<uuid>","regions":[{"roleId":"time_normalize","roleLabel":"시간·한도 보정","startLine":5,"endLine":18},{"roleId":"main_check","roleLabel":"메인 지각 판정 루프","startLine":20,"endLine":38}]}` — 1~4줄·39~40줄은 비교 축 밖이면 regions에 넣지 않아도 된다(미색).',
        "",
        "[중요 — 코드 출력 금지]",
        "- 각 제출의 전체 원문을 출력에 **다시 쓰지 않는다**. 입력 `submissions[].lines`에 이미 줄 단위로 있다.",
        "- submissions[] 각 원소는 **submissionId**와 **regions**만 포함한다. (다른 키 불필요)",
        "",
        "[줄 번호]",
        "- regions의 startLine·endLine은 **해당 제출 입력 객체의 `lines` 배열** 기준 1-based이다. **줄 k의 내용은 `lines[k-1]`** 이다. 서버 검증은 DB 원문 코드와 대조하지만, 너에게 주는 인덱스는 **`lines`와 1:1**이다.",
        "",
        "[reportMarkdown]",
        "- 마크다운으로 작성한다.",
        "- 긴 설명은 **문단 단위**로 끊는다. **문단 사이**에만 빈 줄 한 줄 또는 `<br /><br />` 한 번(문장마다 `<br />` 금지). 코드 펜스 앞에는 **`다음과 같습니다` 류 문장을 넣지 않고**, 빈 줄만 두거나 출처 한 줄만 두고 펜스를 시작한다.",
        ...cohortMarkdownStructureAndCodeRules(reportLocale),
        "",
        "- **「제출 요약」「Submission summary」 같은 제목의 절을 따로 두지 않는다.** 언어별·제출별 목록은 입력 JSON에 이미 있으므로 리포트 맨 앞에 반복하지 않는다.",
        "- **`[[SUBMISSION:id]]`와 다음 글자 사이에 공백·줄바꿈·`<br />` 없음.** 즉시 이어서 `의`, `에서는`, 백틱 등을 붙인다. 플레이스홀더만 한 줄·본문이 다음 줄에 `의`로 시작하면 금지다.",
        "- **한국어에서 `다음과 같습니다`, `코드 발췌는 다음과 같습니다`, `발췌는 다음과 같습니다`, `아래 코드는 다음과 같습니다`, `이 부분은 다음과 같습니다` 등 펜스 앞 상투구를 쓰지 않는다.** 콜론으로 펜스를 연결하지도 않는다.",
        "- 제출을 가리킬 때 **『JavaScript 제출에서는…』『Python 제출에서는…』처럼 언어 이름만으로 서술하지 않는다.** 그 자리에 **`[[SUBMISSION:<submissionId>]]`를 문장 안에 끼워 넣어** 제출 태그(칩)가 그려지게 한다.",
        "  좋은 예. `[[SUBMISSION:uuid]]에서는 maxTime에 10분을 더한 뒤 분이 60 이상이면 40을 가산합니다.` / `이 부분은 [[SUBMISSION:uuid]]의 convert 경로와 대조됩니다.`",
        "  나쁜 예. `JavaScript 제출에서는…`, `파이썬 쪽은…`(칩 없음).",
        "- 서로 다른 언어로 제출되었을 수 있다. 언어는 코드 펜스 언어 태그·발췌 맥락으로 드러나면 되고, **본문에서 제출 식별의 첫 수단은 항상 [[SUBMISSION:…]]** 이다.",
        "- 제출을 가리킬 때는 [[SUBMISSION:<submissionId>]] 플레이스홀더만 쓴다(UUID는 입력과 동일).",
        "- 본문 일반 텍스트에 UUID를 그대로 노출하지 않는다.",
        "- 코드 펜스는 **발췌한 원문**에 맞는 언어 태그(예: python, java, cpp, javascript, typescript, c)를 쓴다.",
        "- **어느 제출의 전체 코드도** 리포트에 붙이지 않는다. 펜스에는 짧은 발췌만 넣는다.",
        "- 각 발췌는 직전·직후 문장과 이어지게 하고, [[SUBMISSION:id]]와 해당 구역의 `roleId`를 본문에서 한 번 이상 언급해 리포트와 열 색이 대응되게 한다.",
        "- 발췌는 해당 제출의 원문(`lines`를 이은 문자열)과 의미가 같아야 하며 과장·변형하지 않는다.",
        cohortLocaleInstruction(reportLocale),
        "- 모델명·프롬프트·시스템·버전·시드 등 구성 메타는 절대 언급하지 않는다.",
        "- 표절 단정·실력 평가·정답 판정은 하지 않는다.",
        "- 알고리즘·자료구조·구현 방식 차이를 중심으로 서술한다.",
        "",
        "[문제 본문 — 분석의 전제]",
        "- 사용자 입력 JSON에는 `assignmentTitle`, `problemUrl`, `problemContext`, `submissions` 등이 있다.",
        "- `problemContext`는 `problemUrl` 페이지를 GET해 HTML→평문으로 바꾼 뒤, 제출 AI 리뷰와 **동일한 규칙**으로 뽑은 `{ summary, input, output }` 이다. 페이지를 불러오지 못하면 **null**일 수 있다.",
        "- **서비스 UI에는 문제 원문을 노출하지 않는다.** 너에게 주는 `problemContext`는 비교 분석 정확도를 위한 **내부 컨텍스트**다. `reportMarkdown`에서는 문제 사이트 본문을 길게 인용·복제하지 말고, 과제 요구는 **네 문장으로 짧게 요약**한다.",
        "- **regions 선택·reportMarkdown 서술은 모두 문제 요구사항·입출력·제약과 연결한다.** 코드만 보고 일반론을 늘어놓지 않는다.",
        "- `problemContext`가 null이면 `assignmentTitle`과 코드에서 드러나는 범위만 언급하고, 문제 전문을 단정하지 않는다.",
        "",
        "[reportMarkdown — 교차 비교 서술(필수)]",
        "- 서두에서 문제가 요구하는 핵심(목표·입력·출력·주의할 제약)을 **짧게** 짚는다(`problemContext.summary`·input·output을 활용).",
        "- **두 제출 쌍**에 대해 `[[SUBMISSION:a]]`와 `[[SUBMISSION:b]]`가 어떤 관점(시간 처리·자료구조·경계 조건·루프 구조 등)에서 **유사한지**, 어디서 **갈라지는지** 구체적으로 쓴다(여러 쌍 가능).",
        "- **다른 두 제출**은 같은 문제 요구를 **어떻게 다르게 구현했는지** 대조한다.",
        "- 제출이 **세 개 이상**이면 `[[SUBMISSION:…]]`를 여럿 묶어 공통점·분기점을 한 문단으로 요약한다.",
        "- 위 교차 비교 문단들이 본문에서 **상당한 비중**을 차지해야 한다. 제출을 파일 순서대로 **한 줄씩만** 요약하는 구성은 실패다.",
        "- regions로 **색을 칠하지 않은 줄**이 있을 수 있다. 리포트 서두 또는 한 번은 **『색이 없는 부분은 이번 집단 비교에서 선택한 축(역할) 밖의 코드(예: 단순 입출력, 문제와 무관한 보조 정의)』** 라는 뜻임을 사용자에게 짧게 알려라.",
        "",
        "[submissions 배열 — 출력]",
        "각 원소: submissionId, regions 만.",
        "- submissionId는 입력과 동일. 모든 제출을 빠짐없이 포함한다.",
        "",
        "[regions — 색으로 보이는 것이 전부이다. 품질 목표]",
        "## 성공한 출력이란(12줄 이상 제출)",
        "- **2~5개**의 **서로 다른** 비교 축으로 나뉘어 있고, 각 축은 **연속 줄 범위** 하나로만 표현된다.",
        "- `entire_code`·전 파일 한 덩어리·루프 **헤더만** 칠하고 본문은 비우는 패턴이 **아니다**.",
        "- **12줄 미만** 짧은 코드는 1~5개 구역이면 되고, 한 구역만 써도 된다.",
        "## 줄무늬가 나오면 실패인 이유",
        "- 한 논리 블록 안에서 **줄을 골라** 여러 조각으로 나누거나, **빈 줄을 구간 밖**에 두면 화면에서 색이 끊긴다. 각 축은 **연속한 start~end 한 구간**이고 그 안의 빈 줄·`}`·`break`까지 전부 포함해야 한다.",
        "## 화면과 사용자의 질문",
        "- 패널에는 **코드 원문 + 네가 준 regions만** 반영된다. 사용자는 **같은 roleId = 같은 슬롯 색**으로만 『어느 제출의 어느 줄이 같은 논점인지』를 본다.",
        "- **미색(칠해지지 않은 줄)** 은 『이번에 비교할 k개 축에 넣지 않은 코드』다. **전 파일을 덮을 필요는 전혀 없다.** 오히려 핵심만 고르는 편이 좋다.",
        "- 사용자는 스스로 묻는다. **『같은 색 띠들이 정말 같은 역할의 로직이 맞아?』** **『칠해지지 않은 줄은 왜 빠진 거야?』** 너의 regions와 리포트는 이 두 질문에 답할 수 있어야 한다.",
        "",
        "## 같은 roleId의 의미(제출 간 정렬의 기준)",
        "- **같은 roleId**는 『같은 알고리즘·문제 풀이 축』을 뜻한다. 문법·줄 수·지역 변수 이름이 달라도, **문제에서 맡기는 역할이 같을 때만** 같은 roleId를 쓴다.",
        "  예: ‘시간 정규화(분 carry)’, ‘출근 한도 계산’, ‘요일·평일만 필터’, ‘사람·날짜 이중 루프로 지각 판정’, ‘우선순위 큐로 다익스트라’, ‘그래프 인접 리스트 구축’ 등.",
        "- **역할이 다르면** 다른 roleId다. 비슷해 보여도(둘 다 for문) 한쪽은 ‘입력 검증’이고 한쪽은 ‘핵심 시뮬레이션’이면 분리한다.",
        "- 제출 A는 해당 축이 10줄, 제출 B는 80줄일 수 있다. **줄 수 차이는 자연스럽다.** 대신 **각 제출에서 그 축은 반드시 하나의 연속 구간**으로 잡는다.",
        "",
        "## 어떤 덩어리를 하나의 region으로 묶는가(자르는 단위)",
        "- **함수·메서드 전체**가 그 축이면 시그니처부터 닫는 `}` 까지 **한 구간**으로 묶는다. 함수 안에서 빈 줄이 있어도 **전부 포함**한다.",
        "- **특정 반복문 하나**(외곽 for, 안쪽 while 등)가 축이면 **루프 헤더부터 해당 닫는 중괄호까지** 한 구간. 루프 **안의 빈 줄·주석·`break`/`continue`/내장 if 전부** 포함한다. **헤더 줄만 칠하고 본문은 미색으로 두는 것은 금지**다.",
        "",
        "## 루프·시뮬레이션 축 (`main_loop`, `주요 루프`, 메인 지각 루프 등) — 오탐 방지(필수)",
        "- roleLabel·역할이 **메인/주요 루프·시뮬레이션 반복**을 뜻하면, 해당 region의 `[startLine,endLine]` **안에 반드시** `for` / `while` / `do` / `forEach` 등 **반복문을 여는 키워드가 있는 줄**이 포함되어야 한다. 구간 전체에 루프 키워드가 **한 줄도 없으면 무조건 잘못된 출력**이다.",
        "- **`main_loop`의 startLine은 가능하면 그 구역에서 가장 바깥쪽 시뮬레이션용 반복문 헤더가 있는 줄**이다. 그 **위에 붙은 `def convert`/`function foo` 같은 중첩 헬퍼 함수 블록 전체**는 이 축에 넣지 않고, **`time_normalize` 등 다른 roleId**로 두거나 미색으로 둔다(헬퍼와 바깥 루프를 한 덩어리로 묶지 않는다).",
        "- 소스에 **「주요 루프」 한 줄 주석·표식만 있고** 실제 `for`/`while`은 그 아래 줄이면, 색 칠하는 구간은 **표식 줄을 포함하지 않아도 되고**, **반드시 실제 반복문 헤더가 있는 줄부터** 포함해야 한다(표식만 칠하고 루프는 빼면 실패).",
        "- **절대 금지 — 실제로 자주 발생한 오류:**",
        "  (a) `break` 다음에만 이어지는 **닫는 `}` 묶음·루프 밖 증감(`day++`)·후처리 if**만 칠하고, 정작 **`for`/`while` 헤더가 있는 줄은 구간 밖**에 두는 것.",
        "  (b) **함수 시그니처·헬퍼 함수의 끝(`return`·`}`)·다음 함수의 선언부·`int ans = 0` 같은 초기화만** 칠하고, **그 아래 줄에서 시작하는 진짜 `for (…)` 루프는 미색**으로 남기는 것.",
        "  (c) 역할 이름만 『루프』인데 구간 안에는 **중괄호와 빈 줄만** 있는 것.",
        "- **올바른 패턴:** 문제의 핵심 이중 루프·사람×날짜 시뮬레이션 등은 **바깥 `for`/`while`이 시작되는 줄을 startLine으로 잡고**, 그 반복문 본문 전체와 **그 반복문을 닫는 짝이 맞는 `}` 줄까지** endLine으로 잡는다. 안쪽 중첩 루프가 있으면 **바깥 루프 한 연속 블록** 안에 포함한다.",
        "- 출력 전에 각 제출 코드에서 해당 region 줄들을 **실제로 읽고**, 『이 구간만 보면 루프가 어디서 도는지 알 수 있는가?』에 **아니오**면 start/end를 다시 계산한다.",
        "- **자료구조·상태 선언**(예: `vector<vector<int>>`, `priority_queue`, 누적 배열, 방문 배열)이 비교 포인트면 **그 선언과 바로 이어지는 초기화**까지 한 덩어리로 묶을 수 있다.",
        "- **이름 붙일 수 있는 알고리즘 덩어리**(다익스트라, 누적 합, 슬라이딩 윈도우 등)는 해당 코드가 이어지는 **연속 물리 줄 전체**를 한 region으로 한다.",
        "- **한 region 안에서는 줄을 골라 칠하지 않는다.** ‘의미 있는 줄만’ 골라 연속이 아닌 집합을 만들면 UI가 줄무늬가 된다.",
        "",
        "## 빈 줄·주석·제어문(스크린샷으로 확인된 전형적 오류)",
        "- **빈 줄은 절대 혼자 미색으로 남기지 마라.** 어떤 논점에 속한 빈 줄이면 **그 논점 region의 start~end 안에 반드시 포함**한다. 빈 줄만 띄엄띄엄 미색이면 실패다.",
        "- **주석 한 줄만** 따로 region으로 두거나, 주석만 칠하고 바로 아래 `if`/`for`는 미색으로 두지 마라. 주석이 그 블록 설명이면 **블록 전체 구간**에 넣는다.",
        "- **`break`, `continue`, 닫는 `}`, `return`** 은 그 논리 블록의 일부다. 블록을 칠할 거면 **같은 구간에 포함**한다.",
        "",
        "## 필수 형태: 한 roleId = 한 연속 구간",
        "- 각 region은 `[startLine, endLine]` **포함 구간 하나**뿐이다. 위에서 아래로 읽을 때 **해당 구간 안의 모든 줄 번호에 같은 색**이어야 한다.",
        "- 서로 다른 region은 줄 구간이 **겹치지 않게** 잡는다(한 줄에 두 역할을 동시에 표현하지 않는다).",
        "",
        "## 이번 실행에서 다룰 축 개수 k",
        "- **제출마다 구역 개수는 1개 이상 5개 이하**. 과제에서 비교 가치가 큰 축만 고른다.",
        "- **모든 제출에 동일한 roleId 집합·개수 k**를 맞춘다(같은 역할 이름을 모든 제출에 쓴다).",
        "- **처음부터** 모든 제출에 **같은 k·같은 roleId 집합**을 맞추고, 각 구간을 **넓고 연속**으로 잡는 편이 좋다.",
        "- **한 줄마다 새 구역을 만들지 않는다.**",
        "- roleId `whole_file` 는 쓰지 않는다.",
        "",
        "## 금지(데이터로 재현된 패턴 — 이렇게 내면 안 된다)",
        "- 논리 블록 **안쪽에서** 칠한 줄 → 미색 빈 줄 → 칠한 줄 … **줄무늬·양자화**.",
        "- `for`/`if`/`while` **선언 줄만** 칠하고, 변수 초기화·본문·`break` 는 미색.",
        "- **연속이 아닌** 여러 작은 조각으로 같은 축을 표현하기(한 축은 **반드시 한 번의 start~end**).",
        "- 『루프』류 역할인데 구간에 **`for`/`while`/`do` 헤더 줄이 없음**(닫는 꼬리·다른 함수 앞부분만 포함).",
        "",
        "## JSON 내기 전 자기 점검(아래가 모두 참일 때만 출력)",
        "- **N≥12** 제출마다 regions 개수가 **2 이상 5 이하**인가. **N<12** 는 1개도 가능한가.",
        "- **N≥12** 에 `entire_code`·1~N 한 구역만 있는 제출이 **없는가**.",
        "- 모든 제출의 roleId 집합·개수 k가 **동일한가**.",
        "- 각 region에 대해 **start~end 사이**에 빈 줄을 **일부러 빼지 않았는가**(줄무늬 방지).",
        "- 각 roleId에 대해 **한 문장으로 역할**을 말할 수 있는가. 제출 간 같은 roleId는 **같은 문제 풀이 단계**인가.",
        "- **`main_loop`·『주요 루프』·『메인 … 루프』 류**: 해당 구간 줄 텍스트를 합쳤을 때 **`for`/`while`/`do`** 중 하나가 **최소 한 줄** 나오는가. 아니면 구간을 **루프 헤더가 포함되도록** 다시 잡는다.",
        "",
        "## English (must follow even when report locale is Korean)",
        "- If a submission has **12+ lines**, **never** use `entire_code` or a **single** region from line 1 through last line; output **2–5** semantic roles with distinct snake_case ids.",
        "- Each region is **one** inclusive contiguous range; include **every** line in that span, especially blank lines, braces, `break`/`continue`, and comments inside that logical unit.",
        "- Same roleId across submissions means **the same solution-stage responsibility** (e.g. normalize time, weekday filter, main double loop), not merely similar syntax.",
        "- Uncolored lines are intentionally **out of scope** for the chosen k themes; do not stripe inside a theme block.",
        "- Never highlight only loop/function headers; always span the **full** logical block.",
        "- For **main loop / simulation loop** roles: the span **must include** the line containing **`for` / `while` / `do`**. **Never** assign that role only to closing braces, tail code after `break`, function preamble, or `int ans = 0` **without** the loop header line.",
      ].join("\n");

      const userPrompt = JSON.stringify(bundleInput) + cohortUserRegionsContractReminder(reportLocale);

      const idsSorted = versionRows.map((v) => v.submission.id).sort();

      let parseResult: CohortLlmBundleParsed | undefined;
      let totalTokens = 0;

      for (let attempt = 0; attempt < 3; attempt++) {
        const temperature = attempt === 0 ? 0.2 : 0.42;
        const { text: rawBundle, tokens } = await openRouterCompletion(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          COHORT_REPORT_MODEL(),
          temperature,
        );
        totalTokens += tokens;

        try {
          parseResult = parseAndValidateCohortBundle(
            rawBundle,
            idsSorted,
            codeBySubmissionId,
            reportLocale,
          );
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg !== "cohort_bundle_regions_semantic_required") {
            throw err;
          }
          if (attempt < 2) {
            continue;
          }
          throw err;
        }
      }

      if (parseResult === undefined) {
        throw new Error("cohort_bundle_parse_failed");
      }

      const reportMarkdown = parseResult.reportMarkdown;
      const { artifacts } = parseResult;

      await this.ds.transaction(async (tx) => {
        await tx.getRepository(AssignmentCohortAnalysisMember).delete({ cohortAnalysisId: analysisId });
        for (const { submission, version } of versionRows) {
          await tx.getRepository(AssignmentCohortAnalysisMember).save(
            tx.getRepository(AssignmentCohortAnalysisMember).create({
              cohortAnalysisId: analysisId,
              submissionId: submission.id,
              submissionVersionId: version.id,
            }),
          );
        }
        const rowDone = await tx.getRepository(AssignmentCohortAnalysis).findOneOrFail({ where: { id: analysisId } });
        rowDone.status = "DONE";
        rowDone.tokenUsed = totalTokens;
        rowDone.reportMarkdown = reportMarkdown.length > 0 ? reportMarkdown : "(리포트가 비었습니다.)";
        rowDone.artifacts = artifacts as unknown as Record<string, unknown>;
        rowDone.failureReason = null;
        rowDone.finishedAt = new Date();
        await tx.getRepository(AssignmentCohortAnalysis).save(rowDone);
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.stack ?? err.message : String(err);
      this.logger.warn(`cohort_pipeline_failed analysisId=${analysisId}\n${detail}`);
      await this.ds.getRepository(AssignmentCohortAnalysis).update(analysisId, {
        status: "FAILED",
        failureReason: cohortPipelineFailureReason(err),
        finishedAt: new Date(),
      });
    }
  }
}
