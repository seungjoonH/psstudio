// 과제 제출 코드 AI 비교 분석 트리거·파이프라인·조회를 담당하는 서비스입니다.
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { type DataSource, In, IsNull } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { requestLlmChat } from "../ai/llm-chat-client.js";
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
  cohortSubmissionLinesFromSource,
  parseAndValidateCohortBundle,
} from "./cohort-analysis-bundle.js";
import { readCohortReportStyleExampleMarkdown } from "./cohort-report-style-example.js";
import { fetchProblemPromptFromUrl } from "./problem-prompt-from-url.js";

/** 리포트·번들 생성은 문제 메타 추론과 동일한 모델 키를 씁니다(추가 env 없음). */
const COHORT_REPORT_MODEL = () => ENV.llmModelProblemAnalyze();

async function llmCompletion(
  messages: { role: "system" | "user"; content: string }[],
  model: string,
  temperature: number,
): Promise<{ text: string; tokens: number }> {
  const response = await requestLlmChat({
    model,
    messages,
    temperature,
    maxTokens: 32768,
  });
  return { text: response.content, tokens: response.totalTokens };
}

function cohortLocaleOverride(locale: CohortReportLocale): string[] {
  if (locale === "en") {
    return [
      "- Prose in English only.",
      "- roleLabel in English.",
      "- **Friendly, walkthrough tone — explain like to a curious beginner.** Avoid terse declarative bullets. Unfold *what* the code does and *why* the submissions diverge. Prefer suggestion-style phrasing (\"can be read as\", \"appears to\", \"works out to\") over absolutes (\"is wrong\", \"impossible\"). No imperative drill-sergeant verbs.",
      "- **Always reference submissions with the `[[SUBMISSION:<uuid>]]` placeholder.** Never identify a submission by language alone (\"the Java submission\", \"the JavaScript one\", \"the Python solution\"), by ordinal (\"the first submission\"), or by author name. Repeat the placeholder every time you mention the same submission again — the UI replaces it with the author chip.",
      "- **Never start a paragraph with a label prefix** like `Explanation:`, `Summary:`, `Note:`, `Result:` (or Korean equivalents). Lead into snippets with a natural sentence or a short bold lead-in.",
      "- **Use inline backticks aggressively** for short code tokens: function names (`solution`), variables (`schedules`), keywords (`for`, `return`), types (`Map`), **format strings** (`HHMM`, `YYYY-MM-DD`), and **short literals** (`+10`, `% 100`, `>= 60`). Keep Korean/English narrative words *outside* backticks. Anything spanning multiple lines or full statements goes in a fenced block instead.",
      "- **Math/complexity goes in LaTeX** (`$...$` inline, blank-line-bounded `$$...$$` display) — never as ASCII-only `O(n^2)`-style prose.",
      "- **Bold (`**…**`) is the only emphasis.** No air-quote pseudo-emphasis with single quotes. Minimize parenthetical asides; split sentences if multiple clauses pile up.",
      "- **Pacing:** when 3+ sentences chain in the same paragraph or one line gets long, insert `<br />` for breath. Section/topic changes use blank lines. New ATX headings and fenced opens always start on their own line preceded by a blank line.",
      "- **Fenced-block lead-in template (preferred):** `…sentence.<br />` → blank line → short bold lead-in (e.g. `**For example:**`) → blank line → ` ```lang` opener. Never end the prior sentence with `:` immediately followed by a fence, and skip filler like \"as follows\".",
      "- **Never use tables.** Forbidden: raw HTML `<table>...</table>`, GFM/Markdown pipe tables (`|`), one-line `|` / `||` fake grids, ASCII grid art. Compare submissions with `###` per submission, bullet lists, or short paragraphs under the same `##` axis. **Do not write meta lines** such as \"We will not use tables\" or \"No tables per requirements\" in user-visible prose—omit tables silently.",
      "- Each `##` axis section must include at least one fenced code block (verbatim excerpt, correct language tag) tied to the claims; never end a section with only prose.",
      "- **UI alignment (JSON only):** in the `submissions[].regions` JSON, keep one internal `roleId` per logical responsibility; prose and fenced snippets for a comparison axis must cite only code inside the matching region’s anchor span on each submission. Snippets must be contiguous substrings of `source` from inside that mapped range.",
      "- **One `roleId` = one logical responsibility (in JSON).** Different purposes (time normalization vs weekday/weekend skip vs lateness threshold vs accumulation) require **different `roleId`s** (different highlight colors). Never label a span \"weekend check\" while anchoring helpers, outer loops, or unrelated comparisons inside it.",
      "- **`reportMarkdown` is end-user prose:** `##` headings use **natural-language axis titles only** (e.g. “Time normalization”, “Main traversal”). **Never** mention `roleId`, other JSON keys, or internal snake_case region ids in headings or explanatory prose. **Never** explain how headings tie to JSON, highlight colors, anchors, or Markdown mechanics (no meta lines like “the backticks in each `##` refer to …”). Use fenced blocks **only** for real code excerpts. The app links highlights from JSON alone.",
      "- **Anchors (first-try success):** `startAnchorText` / `endAnchorText` MUST be copied only from that submission’s input `lines` array (same strings as joined into `source`). Never copy from reportMarkdown prose or fences you authored—they are often prettified and WILL fail validation.",
      "- Use **full physical lines**: preferred form is one or more **entire consecutive `lines[i]` strings** joined with `\\n`, exactly as in input (leading indent, tabs, spaces around `=`, semicolons, brackets). Do not paraphrase or reformat.",
      "- If a single line appears multiple times in the file, extend the anchor to **2+ consecutive full lines** so the match is unique.",
      "- Before emitting JSON, mentally verify each anchor substring appears in `source` with identical spacing (validator allows trim-only-per-line for outer whitespace, NOT internal spacing).",
      "- **USER-VISIBLE FAILURE** (same as Korean prompt `cohort_bundle_regions_semantic_required`): analysis aborts if any submission with `lineCount` ≥ 12 has **`regions: []`**, **exactly one** region object, or **`roleId` `\"entire_code\"`**. Empty `roleId`/`roleLabel` rows are dropped and may leave fewer than 2 → same failure.",
      "- **Long files (`lineCount` ≥ 12 in INPUT):** each such submission MUST output **`regions` with 2–5 valid objects**. **`regions: []` forbidden.** **Exactly one region object forbidden.** Never `roleId` `\"entire_code\"` / `\"whole_file\"`. Every region MUST have non-empty `roleId` and `roleLabel`.",
      "- **Split recipe if stuck:** (A) top/helpers/signature through line before main loop, (B) main loop / core block, (C) return / tail. Never one anchor spanning line 1 through last line as your only region.",
      "- Before emitting JSON, **re-count** `regions.length` for every submission with `lineCount` ≥ 12; if any count is 1 or 0, fix regions first.",
      "- **Root JSON shape:** exactly `{ \"reportMarkdown\": string, \"submissions\": [ … ] }`. The character after `\"submissions\":` must be **`[`**. Never wrap the bundle in `response`/`data`. Never double-encode `submissions` as a string.",
      "- **Style exemplar file:** follow **tone and evidence layout only**. **Never paste or lightly edit sentences from the injected example markdown.** Never reuse the same bullet labels for every submission block.",
      "- **Do not copy** fixed bullet patterns from the exemplar (e.g. identical two-line templates per submission). Rewrite from INPUT `source` only.",
    ];
  }
  return [
    "- reportMarkdown 본문은 한국어로만 작성한다. 한국어 설명 문장에 **일본어(히라가나·가타카나)·중국어 글자가 한 글자도 끼면 안 된다.** 접속·지시는 「이는」「그래서」「따라서」「즉」 같은 한국어로만 쓴다. 코드 펜스 안의 원문, 변수·함수 이름, ASCII 식별자, 숫자, 허용 문장 부호는 예외다.",
    "- roleLabel은 한국어로 작성한다.",
    "- **문체는 친근하게 풀어 설명하는 합니다체.** 짧고 딱딱한 통보형 문장을 쌓지 말고, 코드가 무엇을 하는지·왜 그렇게 갈리는지를 **초등학생도 따라올 수 있을 만큼 풀어** 쓴다. 한 문단 안에서 문장이 **3개 이상** 이어지거나 한 줄이 길면 **중간에 `<br />`로 호흡**을 넣고, 단계가 바뀌면 빈 줄·소제목으로 끊는다.",
    "- **명령형 어미(~하세요/~하라/반드시 ~해라) 금지.** 제안형·설명형(~합니다/~이 되어 있습니다/~로 볼 수 있습니다/~라고 이해할 수 있습니다)을 쓴다. **단정·질책 표현**(불가능·틀렸다·잘못이다)도 줄이고 **여지 있는 표현**으로 풀어 쓴다. 보고체(요망. 검증. 변경. 같은 명사형 종결)도 쓰지 않는다.",
    "- **강조는 마크다운 볼드(`**…**`)로만.** 작은따옴표로 뜻·용어를 감싸는 의사 강조(에어쿼트)는 쓰지 않는다.",
    "- **인라인 백틱은 적극적으로 쓴다.** 함수명·변수명·짧은 코드 토큰·언어 키워드·자료형 이름·**포맷 문자열**(예: `HHMM`, `YYYY-MM-DD`)·**짧은 리터럴**(예: `+10`, `% 100`, `>= 60`)은 모두 인라인 백틱 한 쌍으로 감싼다. **단, 한국어 조사·어미·접속어를 백틱 안에 넣지 않는다.** 백틱은 **코드 토큰과 기호만** 감싼다. 한 줄을 넘는 코드·여러 문장·`for`/`while`/`if` 블록은 인라인 백틱이 아니라 **반드시 ``` 펜스**로 쓴다.",
    "- **인라인 백틱에 JSON 내부 필드명·식별자를 넣지 않는다.** `roleId`·`startAnchorText`·`endAnchorText`·`regions` 같은 데이터 모델 단어는 **본문·제목·백틱 어디에도** 노출하지 않는다(코드 발췌 ``` 펜스 자체는 허용). `##` 제목은 비교 주제만 자연어 한 줄로 쓴다. 「각 `##`의 백틱은 …」「이 절은 어떤 구역을 가리킨다」처럼 **마크다운 구조·색 하이라이트·데이터 모델을 설명하는 메타 문장도 금지.** 화면 구역 연동은 JSON만으로 처리된다.",
    "- **제출 지칭은 무조건 `[[SUBMISSION:<uuid>]]` 태그.** 「Java 제출은」「JavaScript 제출은」「Python 제출은」「C++ 제출은」「첫 번째 제출은」 같이 **언어 이름·순서·작성자 이름만으로** 제출을 가리키는 표현은 **단 한 번도 쓰지 않는다.** 한 문단에서 같은 제출을 두 번 부를 때도 매번 `[[SUBMISSION:…]]` 태그를 다시 넣는다(태그 자리에 화면에서는 작성자 칩이 들어간다).",
    "- **라벨 prefix 금지.** 코드 펜스 앞·뒤 문단을 **「설명:」「해설:」「풀이:」「정리:」「요약:」「결과:** 같은 머릿말로 시작하지 않는다.** 그냥 평문 한국어 문장(또는 볼드 도입)으로 자연스럽게 잇는다.",
    "- **코드블록 도입 템플릿(권장):** `…설명 문장.<br />` → 빈 줄 → **`**예:**`** 또는 **`**아래와 같이 작성되어 있습니다.**`** 같은 짧은 볼드 도입 한 줄 → 빈 줄 → ` ```언어` 펜스 시작. **콜론(`:`)으로 끝나는 문장 바로 다음 줄에 펜스를 붙이지 않는다.** as follows·다음과 같습니다 같은 영혼 없는 filler 문구는 쓰지 않는다.",
    "- **표 금지.** 원시 HTML `<table>`·Markdown 파이프 표(`|`)·한 줄 파이프 나열·ASCII 격자 모두 출력하지 않는다. **독자에게 「표를 쓰지 않는다」「표는 사용하지 않습니다」 같은 형식 안내를 쓰지 마라.** 비교는 같은 `##` 축 안에서 제출별 `### [[SUBMISSION:…]]` 소제목·목록·단락으로만 한다.",
    "- 앵커는 해당 제출 입력 `lines` 원문에서만 복사한다. 리포트 본문·펜스는 앵커 소스로 쓰지 않는다.",
    "- **`roleId` 하나는 한 가지 논리 책임에만 대응한다.** 시간 환산·주말 스킵·지각 비교·누적 갱신처럼 목적이 다르면 **`roleId`를 나눈다**(화면 색이 달라진다). 「주말 확인」처럼 좁은 이름을 붙였는데 헬퍼·바깥 루프·무관한 비교까지 같은 구역에 넣지 마라.",
    "- 입력 `lineCount` 가 **12 이상**인 제출마다 JSON **`regions` 배열에 유효 객체가 최소 2개·최대 5개**여야 한다. **`regions: []` 금지.** **객체가 정확히 1개만 오는 것도 금지.** `roleId`에 문자열 `entire_code`·`whole_file` 금지. `roleId`/`roleLabel` 빈 문자열 금지(해당 행은 검증기에서 삭제되어 개수 부족으로 실패할 수 있음).",
    "- JSON 출력 직전, **lineCount≥12인 각 제출에 대해 `regions.length`(유효 객체 수)를 다시 세어라.** 2 미만이면 분할을 다시 설계하고 JSON을 내지 마라.",
    "- 시스템에 붙는 예시 마크다운(`cohort-report-template.example.md`) **문장·불릿 패턴을 리포트에 복사하지 마라.** INPUT 코드만 근거로 새로 쓴다.",
  ];
}

function buildCohortSystemPrompt(locale: CohortReportLocale): string {
  const localeRules = cohortLocaleOverride(locale);
  return [
    "[ROLE]",
    "- 너는 과제 제출 코드 AI 비교 분석기다. 출력 invariant를 최우선으로 지켜라.",
    "",
    "[OUTPUT CONTRACT]",
    "- 유효한 JSON 객체 하나만 출력한다.",
    '- 최상위 키는 정확히 "reportMarkdown"(string), "submissions"(array)다.',
    "- **`submissions` 배열 형식(필수):** 루트 객체에서 `\"submissions\":` 바로 다음은 **`[` 로 시작하는 배열 리터럴**이어야 한다. 올바른 예: `\"submissions\": [{ \"submissionId\": \"…\", \"regions\": [...] }, …]` . `{ uuid: { regions } }` 맵 형태는 서버가 예외적으로 읽을 수 있으나 **모델은 반드시 배열만 출력**한다.",
    "- `submissions` 내용을 **JSON 문자열로 한 번 더 인코딩**하지 마라. 문자열이면 검증기가 실패할 수 있다(`cohort_bundle_submissions_not_array`).",
    "- 응답을 **`response`·`data`·`result` 등으로 한 겹 더 싸지 마라.** 최상위가 곧 번들 `{ reportMarkdown, submissions }` 여야 한다.",
    "- 참고용 `design/cohort-report-template.example.md`는 **뉘앙스만** 따른다. **예시와 동일한 목차 문장·동일한 네 축 순서·동일한 절 제목을 출력하라는 요구가 아니다.** **`### 1. 전처리`** 같은 번호 목차를 그대로 베끼지 마라. 비교 축 `##` 제목은 [REPORT CONTRACT]대로 **자연어 주제만** 쓴다(내부 `roleId` 금지).",
    "- `submissions`는 반드시 **배열**이다. UUID 맵 `{ \"uuid\": { \"regions\": … } }`는 최후의 비권장 형태일 뿐이며, **항상 배열 출력을 우선**한다.",
    "- submissions 각 원소는 `submissionId`, `regions`만 포함한다.",
    "- regions 각 원소는 `roleId`, `roleLabel`, `startAnchorText`, `endAnchorText`만 포함한다.",
    "- `startLine`/`endLine`/전체 코드 재출력 금지.",
    "",
    "[SERVER WILL FAIL — 반드시 회피]",
    "- 사용자에게 보이는 실패 사유: \"코드 전체 한 덩어리(entire_code)·긴 코드에서 비교 축 1개\". 아래 중 하나면 검증기가 **`cohort_bundle_regions_semantic_required`** 로 전체 분석을 실패 처리한다.",
    "  1) 해당 제출 `lineCount`≥12 인데 `regions`가 **빈 배열 `[]`**.",
    "  2) 같은 조건에서 **`regions`에 객체가 1개뿐**. (레이블이 뭐든, 한 구역이 파일 전체 줄을 덮는 단일 축도 동일하게 거절된다.)",
    "  3) **`roleId` 문자열이 정확히 `entire_code`** 이거나, 폴백으로만 쓰이는 예약과 동일한 의미의 단일 전역 구역.",
    "  4) **`roleId`/`roleLabel`을 빈 문자열로 둔 행**은 검증 전 삭제된다. 삭제 후 2개 미만이 되면 동일 실패.",
    "- 위 실패는 **리포트 문장 품질과 무관하게 전부 차단**된다. 먼저 각 긴 제출을 **물리적으로 2~5개 연속 줄 블록**으로 나눈 뒤 나머지를 작성한다.",
    "",
    "[CRITICAL HARD FAIL RULES]",
    "- 아래 위반은 validator에서 즉시 parse 실패 처리된다.",
    "- 모든 submissionId 포함.",
    "- **각 제출 독립 규칙:** 한 제출의 `lineCount`가 N≥12이면 그 제출만 regions **2~5개**. N<12인 제출은 그 제출만 regions **1~5개**.",
    "- **제출 간 동일한 roleId 집합·같은 개수를 맞출 필요 없음.** 제출 A에만 있는 구조(예: 명시적 이중 for)와 제출 B에만 있는 구조(예: 재귀만)가 있어도 된다. 다른 제출에 맞추려고 빈 축·억지 축을 만들지 않는다.",
    "- 앵커(start/end)는 **입력 JSON의 해당 제출 `lines` 배열 원소를 그대로** 이어 붙인 문자열이어야 하며 `source`에 존재해야 한다. 리포트 본문·펜스·기억 속 코드에서 베끼면 `cohort_bundle_anchor_not_found`로 즉시 실패한다.",
    "- region은 하나의 연속 범위여야 한다.",
    "- **반복문을 다루는 region**(`roleId`·`roleLabel`이 실질적으로 루프/순회를 가리킬 때)에 한해, 그 구간에 실제 루프 헤더(`for`/`while`/`do`/`forEach` 등)가 포함되어야 한다. **해당 제출에 그런 루프가 없으면** `main_loop`·「주요 반복문」 류의 region을 **만들지 않는다**(재귀·고차함수·스트림만 쓰는 풀이는 그에 맞는 스네이크케이스 roleId로 나눈다).",
    "- N≥12인 제출에서 `entire_code`/`whole_file`/유효 region 1개만 출력하면 즉시 실패.",
    "- **`regions: []` 절대 금지.** 빈 배열이 오면 서버가 코드 전체를 `entire_code` 한 구역으로 바꿔 곧바로 `cohort_bundle_regions_semantic_required`(실패 메시지: 한 덩어리·축 1개)로 끝난다.",
    "- **`roleId`/`roleLabel` 빈 문자열 금지.** 비면 해당 객체는 통째로 무시되어 `regions` 개수만 줄어든다. 12줄 이상 제출에서 2개 미만으로 남으면 동일 실패다.",
    "",
    "[긴 코드(lineCount≥12) 최소 분할 레시피 — 실패 방지용]",
    "- 구조를 모르겠어도 **최소 3등분**으로 통과시킨다: (A) 파일 상단~주 진입점 직전(헬퍼·상수·시그니처·초기 변수), (B) 핵심 순회·분기·갱신이 모인 **중간 대블록**, (C) 마지막 반환·요약·후처리. 단일 함수만 있어도 **첫 번째 주요 `for`/`while`/`forEach` 직전에서 끊고**, 루프 블록을 (B), `return` 이전 몇 줄을 (C)로 나눈다.",
    "- 한 region의 앵커가 **줄 1부터 마지막 줄까지**를 모두 포함하면 \"전체 한 구역\" 실패로 이어질 수 있으므로, **끝 줄 번호가 파일 끝인 축을 2개 이상 두지 않는다**(마지막 축만 `return` 근처 짧게).",
    "",
    "[REGION CONTRACT — 제출별 맞춤]",
    "- 각 `submissionId`에 대해 **그 파일의 실제 제어 흐름**을 보고 2~5개(또는 짧은 파일은 1~5개)의 연속 구간을 잡는다. **한 제출 안에서는 줄 번호 기준으로 구간이 크게 겹치지 않게** 나눈다(앞 region의 끝 다음 줄부터 다음 region 시작이 이상적). 한 구역이 거의 전 파일을 덮는데 다른 구역이 그 안의 일부만 묻는 식의 **포함 관계 남용**은 피한다.",
    "[SEMANTIC — 줄 12+ 제출의 regions 배열]",
    "- 입력 JSON에서 해당 제출의 `lineCount`가 **12 이상**이면, 그 제출의 `regions`는 **최소 2·최대 5**이고, **실제로 파싱되는 객체 수**도 2 이상(빈 `roleId`/`roleLabel`로 줄어들면 안 됨).",
    "- 12줄 미만 제출은 1~5개. 가능하면 2개 이상을 권장하지만 검증기 하드 실패는 12줄 이상 제출 기준이다.",
    "- 참고용 패턴만(강제 아님): 헬퍼·정규화, 상태 초기화, **실제 존재할 때만** 순회/시뮬레이션 블록, 판정·누적 갱신, 반환·후처리. 이름은 `input_or_parse` 같은 뼈대를 그대로 베끼지 말고, **그 줄들이 하는 일을 한국어·구체적으로** 새 roleId를 짓는다.",
    "- **구간·라벨 품질(필수):**",
    "  - 한 region이 **함수 본문·파일의 과반 줄**을 덮으면 실패에 가깝다. 이런 경우 **더 잘게 쪼개거나**, 라벨을 바꿔도 여전히 ‘전체 한 덩어리’면 축 자체를 재설계한다.",
    "  - **금지:** 「입력 및 변환」「핵심 로직」「메인」처럼 **내용 없이 넓게만** 덮는 라벨. 단, 리포트 도입부에서 **전처리·순회·판정** 같은 축 이름을 쓸 계획이면, 그에 맞는 region을 **실제 그 역할만** 담은 줄 범위로 잡고 `roleLabel`도 그 일을 구체적으로 쓴다(예: 주말 판별 헬퍼와 카운터 초기화만 — 순회 본문 전체가 아님).",
    "  - `roleLabel`은 **그 연속 줄 블록만** 설명해야 한다. 스코프 밖의 역할을 끌어와 이름에 넣지 않는다.",
    "- **[역할·논리 일치 — 색 구역 혼동 방지]** 화면에서는 **서로 다른 `roleId`마다 다른 색**이므로, 목적이 다르면 다른 `roleId`를 부여하고 줄 구간을 나눈다.",
    "  - **시간 표현 변환**(HHMM→분, `normalize`, `convert` 등), **주말·휴일 스킵 분기**(`continue`, 요일 검사), **지각·한도 초과 비교**, **통과 누적·반환**은 같은 로직이 아니다. 한 구역의 라벨을 「주말 확인」「지각 확인」「시간 변환」 중 하나로 좁혀 놓고 **그 라벨과 무관한 줄**(다른 목적의 헬퍼·비교·바깥 루프 전체)까지 같은 앵커에 넣지 마라.",
    "  - 좁은 이름의 구역은 **그 이름이 말하는 줄만** 포함한다. 예: 「평일만 처리」류는 실제 요일 분기 줄 근처만. 헬퍼 함수 전체는 「시간 환산 헬퍼」 등으로 **별도 region**.",
    "  - 이중 루프 한 블록 안에 주말 건너뛰기·지각 비교가 함께 있으면 **한 구역으로 묶더라도** 라벨은 둘 중 하나만 대표하지 말고 **구간 전체를 설명하는 구체적 문구**(예: 「직원·요일 순회와 평일 지각 검사」)를 쓰거나, 가능하면 **바깥 루프 본문을 주말 분기 전후로 쪼개** 양쪽에 다른 `roleId`를 준다.",
    "- **[OUTLINE ↔ REGIONS 동일 판단 기준]** 리포트 `#` 바로 아래·개요에서 \"이하에서는 … 순으로 살펴보겠습니다\"처럼 **비교 축 순서를 약속하면**, 그 순서·주제는 **`submissions[].regions`로 이미 정한 구획**과 같은 기준으로 맞춘다. 위에서 \"전처리\"라고 했으면 전처리 절의 펜스는 **전처리 region 앵커 구간**에서만 가져오고, 순회 본문을 전처리 절에 넣지 않는다. 도입 문장과 region 설계가 어긋나면 **regions를 우선으로 두고 개요·`##` 제목을 수정**한다.",
    "- 축을 정하기 전에 앵커를 고르지 않는다. 제출마다 **그 제출 안에서** 논리 덩어리를 확정한 뒤 앵커를 잡는다.",
    "[ANCHOR — 단일 진실 공급원]",
    "- 앵커 텍스트를 정할 때 **오직** 입력 객체 `submissions[].lines`(동일 제출의 `source`와 줄 단위로 같음)만 연다. 리포트/HTML/마크다운 펜스는 앵커 소스로 쓰지 않는다.",
    "- **권장:** `startAnchorText`는 구간 **첫 줄 전체**(`lines[시작줄번호-1]` 한 원소 그대로). `endAnchorText`는 구간 **마지막 줄 전체**. 여러 줄 블록이 필요하면 **연속된 `lines` 원소를 `\\n`으로만 연결**하고 각 원소 문자열은 입력과 동일해야 한다.",
    "- 금지: 연산자 주변 공백 재배치(`x=1`↔`x = 1`), 세미콜론 추가/삭제, 따옴표 종류 바꾸기, 들여쓰기 탭↔스페이스 변환, 요약용으로 줄인 한 줄.",
    "- 한 줄 패턴이 파일 안에 여러 번 반복되면(예: `if (` 같은 줄) **유일해지도록** 첫 앵커를 2줄 이상 연속 전체 줄로 잡는다.",
    "- `endAnchorText`는 비우지 않는다(빈 문자열은 검증 실패로 이어질 수 있음). 구간 끝 줄 전체를 넣는다.",
    "- **순회·루프로 표시한 region에 한함:** 포함 범위는 실제 loop header, 논리적 본문 전체, 내부 빈 줄, 닫는 중괄호까지. 금지: 헤더 없이 주변 코드만, braces만, break/continue만으로 덮기.",
    "- `entire_code`, `whole_file`, 단일 대구간 덮기 금지(N≥12).",
    "- roleId는 snake_case로 짧게 작성하고, 제출 내부 중복 roleId를 만들지 않는다.",
    "- **`roleId`로 `entire_code`·`whole_file` 문자열을 쓰지 않는다.**(검증기·예약어와 충돌)",
    "",
    "[REPORT CONTRACT]",
    "- region을 먼저 확정한 뒤 reportMarkdown을 생성한다(2단계 생성).",
    "- 개요에서 **스스로 연** 비교 순서가 있으면 **`##` 섹션 순서·각 절 주제**가 그와 일치해야 한다. 단, 그 순서는 **예시 파일의 「전처리→반복문→…」와 같을 필요 없고**, 해당 코드에 맞게 새로 정한 로드맵이면 된다.",
    "- 비교 주제 순서를 문서 끝까지 유지한다.",
    "- `#` 1회, `##`/`###`로 구성.",
    "- **UI:** 화면 색 구역은 각 제출 JSON의 `regions[].roleId` 앵커 구간과 일치해야 한다. **`roleId` 하나는 한 가지 논리 책임**(시간 환산 vs 요일 스킵 vs 지각 비교 등)에 대응하게 두어, 서로 다른 목적을 같은 색 한 덩어리로 오인하지 않게 한다. 제출마다 `roleId` 집합이 달라도 된다.",
    "- **`##` 비교 축:** 문제를 푸는 **관점별**(예: 시간 처리, 순회 구조, 통과 판정)로 `##` 제목을 **독자용 한글 자연어**만으로 짓는다. **`roleId`·스네이크케이스 내부 id·JSON 키 이름을 제목이나 본문에 넣지 않는다.** 구역과 색은 `submissions[].regions` JSON에만 두고, 리포트에서는 **코드가 하는 일**만 말한다.",
    "- 각 `### [[SUBMISSION:id]]` 블록의 펜스·서술은 **그 제출의 어떤 단일 region 앵커 구간 안 원문만** 근거로 삼는다. 구간 밖이나 다른 제출 코드를 섞지 않는다.",
    "- 펜스 문자열은 해당 제출 `source`의 **연속 부분 문자열**이어야 하며, 인용한 region의 `startAnchorText`~`endAnchorText` 범위를 벗어나지 않는다.",
    "- 제출 간 구역 개수가 다르면, 리포트에서 한 관점을 다룰 때 **일부 제출만** 해당 문단을 채우거나, 제출마다 다른 소제목 순서를 써도 된다. 억지로 모든 제출에 같은 소목차를 맞추지 않는다.",
    "- **제출 지칭은 매번 `[[SUBMISSION:id]]` 태그로만.** 「Java 제출은」·「JavaScript 제출은」·「Python 제출은」·「C++ 제출은」·「첫 번째 풀이는」·「작성자 X는」처럼 **언어명·순번·이름으로만** 가리키면 화면에서 작성자 칩이 사라져 누가 쓴 코드인지 알 수 없게 된다. 같은 문단에서 같은 제출을 두 번째 부를 때도 다시 `[[SUBMISSION:…]]` 태그를 넣는다. 어쩔 수 없이 언어/스타일을 함께 쓰고 싶다면 **태그를 먼저** 두고 부연 한 단어를 덧붙이는 형태로만 쓴다(예: `[[SUBMISSION:…]]`은 자바스크립트 풀이라서 …).",
    "- 같은 의미 문장을 제출 수만큼 반복하지 않는다. 동일 축 설명은 한 번 요약하고 제출별 차이는 구조화해서 제시한다.",
    "- **내부 준수(독자에게 쓰지 말 것):** 원시 HTML `<table>...</table>`, Markdown 파이프 표(`|`), 한 줄 파이프 나열, ASCII 격자는 **절대 출력하지 않는다.** 이 금지는 **리포트 본문에 「표를 쓰지 않는다」「표는 사용하지 않습니다」 등 형식·규칙을 설명하는 문장으로 쓰지 말고**, 그냥 표 없이 서술·목록·소제목으로만 비교한다.",
    "- 같은 `##` 안에서 여러 제출을 다룰 때는 각 제출을 `### [[SUBMISSION:id]]` 아래에 두고, **그 절의 주제(예: 전처리)**에 맞는 region 스니펫만 둔다. 참고 템플릿의 목차를 무조건 복붙하지 않되, **자신이 개요에서 연 로드맵은 반드시 지킨다.**",
    "- 제출별로 반복 서술이 필요하면, 그 제출 코드에 맞는 소목차로 정렬한다. 어떤 제출에는 ‘바깥 순회’가 없을 수 있음을 서술에 반영한다.",
    "- 코드 비교는 fenced excerpt를 사용하며 전체 파일 붙여넣기 금지.",
    "- 각 `##` 축 섹션마다 최소 1개 이상의 펜스 코드 블록(``` 언어태그 + 원문 발췌)이 있어야 한다. 서술만 두고 스니펫 없이 해당 축을 끝내지 않는다.",
    "- 여러 제출을 한 축에서 비교할 때는, 각 제출 블록 직후(또는 인접하게) 그 주장을 뒷받침하는 펜스를 배치한다(한 제출당 1블록 이상 권장).",
    "- 모든 핵심 설명 문단에는 해당 설명을 뒷받침하는 코드 스니펫을 인접하게 배치한다(설명만 단독으로 두지 않는다).",
    "- 스니펫은 반드시 설명과 같은 축/같은 제출에서 발췌한다. 설명과 무관한 코드 인용 금지.",
    "- 각 스니펫 직전 문장에 **어느 제출**인지(`[[SUBMISSION:id]]`)와 **인용 구간이 다루는 내용**(한글 짧은 설명)·**줄 범위**를 자연어로 명시한다. **`roleLabel`/`roleId` 같은 필드명을 그대로 적지 않는다.**",
    "- 코드 펜스 앞 filler 문구(as follows/다음과 같습니다 등) 금지.",
    "- 코드 펜스 직전 문장을 콜론(:)으로 끝내지 않는다.",
    "- `problemContext` 기반으로 제출 간 유사점/차이를 비교한다.",
    "",
    "[REPORT TONE & STYLE — 독자가 따라올 수 있게]",
    "- **독자 가독성을 최우선**으로 한다. **사용자를 배려**해 읽고 충분히 이해할 수 있게 쓴다. **초등학생에게 설명해도 통하는** 말과 비유 수준을 목표로 한다. 한 줄 요약·전문 용어로 어렵게 넘기지 말고 **풀어서** 설명한다.",
    "- **한국어 톤은 친근한 합니다체.** 항상 공손·겸손하게 쓴다. **명령형 어미(~하세요/~하라/반드시 ~해라) 금지**, 제안·설명형(~합니다/~로 보입니다/~로 이해할 수 있습니다/~라고 볼 수 있습니다)을 쓴다. 명사형 종결만으로 끊는 보고체(요망. 검증.)는 쓰지 않는다.",
    "- **단정·질책은 줄인다.** '불가능''틀렸다''명백히 나쁘다' 같은 단정 대신 근거와 함께 **가능성·추정**으로 쓴다. 비교가 부정적인 쪽으로 흐르더라도 차분한 서술로 풀어 쓴다(이 분석도 모델이 만든 것이라 오류가 있을 수 있음을 전제).",
    "- **「설명:」「해설:」「풀이:」「정리:」「요약:」「결과:」 같은 라벨 prefix로 문장을 시작하지 않는다.** 코드 펜스 앞·뒤 문단도 자연스러운 평문 또는 짧은 볼드 도입 한 줄로 잇는다.",
    "- **인라인 백틱을 적극 활용한다.** 함수명(`solution`, `convert`)·변수명(`schedules`, `late`)·언어 키워드(`for`, `while`, `forEach`, `return`)·자료형(`Map`, `Set`)·**포맷 문자열**(`HHMM`, `YYYY-MM-DD`)·**짧은 코드 토큰·리터럴**(`+10`, `% 100`, `>= 60`, `=== 7`, `[]`, `{}`)은 모두 인라인 백틱 한 쌍으로 감싼다. **백틱 안에는 코드 토큰·기호만** — 한국어 조사·어미·접속어를 백틱으로 감싸지 않는다. 한 줄을 넘는 코드·여러 문장·블록 단위는 인라인 백틱이 아니라 **반드시 ``` 펜스**로 쓴다.",
    "- **수식·복잡도 정량 서술**(연산 상한·합·곱·근호·지수·Big-O)이 한 번이라도 나오면 **반드시 LaTeX**(`$...$` 인라인, 빈 줄로 둘러싼 `$$...$$` 디스플레이)만 쓴다. 평문·코드풍 문자만으로 식을 흉내 내지 않는다(`O(n^2)` 같은 ASCII식보다는 `$O(n^2)$`).",
    "- **강조는 마크다운 볼드(`**…**`)로만.** 작은따옴표 의사 강조(에어쿼트)는 쓰지 않는다. **소괄호 `()` 부연은 최소화**한다. 한 문장에 괄호가 여러 겹·연속이면 문장을 나누거나 풀어 쓴다.",
    "- **호흡·구조:** 같은 문단·같은 제목 안에서 문장이 **3개 이상** 이어지거나 한 줄이 길면 **중간중간 `<br />`로 환기**한다. 단계·문단이 바뀌면 **빈 줄**로 나눈다. 새 ATX 제목·새 펜스 시작은 **앞에 빈 줄을 두고 단독 줄**로만 시작한다(`<br />`만으로 새 제목·펜스를 대체하지 않음).",
    "- **코드블록 도입 템플릿(권장):** `…설명 문장.<br />` → 빈 줄 → 짧은 볼드 도입 한 줄(예: `**예:**`, `**아래와 같이 작성되어 있습니다.**`) → 빈 줄 → ` ```언어` 펜스 시작. 콜론(`:`)만 달고 같은 줄에 펜스·인라인 코드를 붙이지 않는다.",
    "- **언어·문자 집합:** 한국어 설명 구간에 **일본어(히라가나·가타카나)·중국어 글자가 한 글자라도** 끼면 안 된다(`これは`·`は`·`的`·`了` 등 금지). 접속·지시는 한국어로만(`이는`, `그래서`, `따라서`, `즉`). 코드 펜스 안 원문, 변수·함수 이름, 숫자, ASCII 식별자, 허용 문장 부호는 예외.",
    "",
    "[EXEMPLAR 복사 금지 — 최우선]",
    "- 시스템 프롬프트에 이어 붙는 `design/cohort-report-template.example.md` 전문은 **문체·비교 밀도·`[[SUBMISSION:uuid]]` 인용 방식**만 보여 준다. **예시 문장·절 제목·번호 목차·고정 불릿 라벨(예: 「순회 방식.」「갱신 및 판정 요약.」 등)을 `reportMarkdown`에 한 줄이라도 그대로 또는 거의 그대로 재출력하지 마라.**",
    "- 예시에 나온 **불릿 틀을 모든 제출 블록에 동일하게 채우는 행위**(복붙·템플릿 채우기)는 금지에 가깝다. 코드가 비슷해 보여도 **제출마다 비교 문장을 새로** 쓴다.",
    "- 실제 근거는 **오직 INPUT JSON**의 `submissions[].source`·`problemContext`뿐이다. 예시 UUID·예시 본문 문장을 바탕으로 추론하지 않는다.",
    "",
    "[STYLE EXEMPLAR — reportMarkdown 참고 본문]",
    "- 저장소 `design/cohort-report-template.example.md` 전문은 위 [EXEMPLAR 복사 금지]를 지키는 전제에서 **길이·전개 리듬만** 참고한다. **예시와 같은 목차 문구·같은 순서·같은 절 이름을 따라 하라는 뜻이 절대 아니다.** (예: 「전처리→반복문→…」 고정 목차 복붙 금지.)",
    "- 각 과제·각 제출 묶음마다 **도입부 로드맵과 `##` 축 제목을 코드에 맞게 새로** 짓는다. 반복문이 없으면 반복문 절을 약속하지 않는다.",
    "- 이어 붙는 예시 파일 본문은 길이·비교 서술·목록·단락 배치의 품질 참고용이다. 예시의 `### 개요`, 번호 단계(`### 1. …`), 개요 속 「차례대로 … 순으로」 한 줄은 샘플일 뿐이다. 실제 reportMarkdown의 각 `##`는 [REPORT CONTRACT]의 **자연어 비교 주제**만 따른다. 예시와 같은 ### 번호 체계로 축을 대체하지 않는다.",
    "- 예시 UUID는 플레이스홀더다. 출력 reportMarkdown에는 INPUT JSON의 submissionId만 넣는다.",
    ...(locale === "en"
      ? [
          "- `reportLocale`이 en이면 아래 한국어 예시는 구조·근거 제시 방식만 참고하고, 문장은 영어로 작성한다.",
        ]
      : []),
    "",
    readCohortReportStyleExampleMarkdown(),
    "",
    "[LOCALE OVERRIDE]",
    ...localeRules,
    "",
    "[SELF CHECKLIST]",
    "- [ ] valid JSON",
    "- [ ] 루트 JSON에서 `\"submissions\": [` 로 시작하는가(맵·문자열 이중 인코딩·래퍼 객체 없음)",
    "- [ ] `submissions`가 배열인가(객체 맵이 아닌가)",
    "- [ ] all submissionIds included",
    "- [ ] 제출마다 실제 코드 구조에 맞는 region인가(다른 제출과 roleId·개수를 억지로 맞추지 않았는가)",
    "- [ ] anchors copied verbatim",
    "- [ ] 모든 앵커가 해당 제출 입력 `lines`의 연속 원소를 그대로 이은 것인가(리포트·펜스 아님)",
    "- [ ] 반복되는 한 줄만 앵커로 쓰지 않았는가(필요 시 2줄 이상 블록)",
    "- [ ] `endAnchorText`가 비어 있지 않은가",
    "- [ ] contiguous regions only",
    "- [ ] no single-region output for 12+ lines",
    "- [ ] INPUT에서 lineCount≥12 인 **모든** 제출에 대해 `regions` 유효 객체가 **2 이상 5 이하**인가(JSON 배열 원소 개수를 실제로 셌는가)",
    "- [ ] lineCount>=12 제출마다 `regions`가 **빈 배열이 아니고** 유효 항목 **2개 이상**인가",
    "- [ ] 모든 region 항목에 비어 있지 않은 `roleId`·`roleLabel`이 있는가(하나라도 빈칸이면 해당 행 폐기됨)",
    "- [ ] 루프로 부른 구간에는 실제 루프 헤더가 있는가(루프가 없는 제출에 주요 반복문 축을 만들지 않았는가)",
    "- [ ] 각 12줄+ 제출에서 region이 2~5개인가(제출 간 k 동일 불필요)",
    "- [ ] 추상 라벨로 함수 대부분을 한 구역에 묶지 않았는가",
    "- [ ] 시간 환산 헬퍼·요일/주말 분기·지각 한도 비교 등 **서로 다른 목적을 같은 `roleId`/한 앵커에 넣지 않았는가**(묶을 경우 `roleLabel`이 구간 전체를 정직하게 설명하는가)",
    "- [ ] 개요·`##` 축 이름과 JSON regions·각 절 펜스가 같은 기준으로 묶였는가(위에서는 전처리라며 아래에서 순회 본문을 전처리로 부르지 않았는가)",
    "- [ ] `cohort-report-template.example.md`와 **동일한 목차 문구·순서**를 베끼지 않았는가(뉘앙스만 참고)",
    "- [ ] 예시 파일의 **문장·고정 불릿 패턴**을 복사하지 않았는가(제출마다 같은 두 줄 불릿 틀 반복 없음)",
    "- [ ] 한 제출 안에서 region 줄 구간이 불필요하게 거의 전체를 덮는 한 덩어리 + 그 안의 부분 축으로 중복 라벨하지 않았는가",
    "- [ ] `entire_code`/`whole_file`/전구간 단일 region 미사용",
    "- [ ] 동일 의미 문장을 제출별로 반복하지 않았는가",
    "- [ ] 표를 전혀 쓰지 않았는가(HTML `<table>`·Markdown `|` 표·한 줄 파이프 나열 금지)",
    "- [ ] 사용자에게 보이는 본문에 표 금지·규칙 준수 같은 메타 설명을 넣지 않았는가",
    "- [ ] `reportMarkdown`에 `roleId`·JSON 필드명·「백틱/절/색」 같은 구현·형식 메타 설명이 없는가",
    "- [ ] 각 `##` 축에 펜스 코드 블록이 실제로 있는가(제출별 비교 블록 직후 근거 스니펫 포함)",
    "- [ ] 핵심 설명마다 근거 코드 스니펫이 바로 붙어 있는가",
    "- [ ] 각 `##` 제목이 자연어만이고, 펜스는 해당 제출의 해당 region 앵커 구간 안 원문만 인용했는가",
    "- [ ] 모든 제출 지칭이 `[[SUBMISSION:…]]` 태그로 되어 있는가(「Java 제출」「JavaScript 제출」「Python 제출」「C++ 제출」「첫 번째 제출」 등 언어명·순번·작성자명-only 지칭이 한 군데도 없는가)",
    "- [ ] 「설명:」「해설:」「풀이:」「정리:」「요약:」「결과:」 같은 라벨 prefix로 시작하는 문단이 한 줄도 없는가",
    "- [ ] 짧은 코드 토큰·포맷 문자열(예: `HHMM`, `+10`, `% 100`, `>= 60`, 함수·변수명, 키워드)이 인라인 백틱으로 감싸여 있는가(평문에 토큰을 그대로 흘려 두지 않았는가)",
    "- [ ] 문체가 친근하게 풀어 설명하는 합니다체인가(통보형 한 줄·명령형 어미·보고체·단정 표현이 없는가)",
    "- [ ] 한 문단 안 3+ 문장이 이어질 때 `<br />`로 호흡을 주거나 단계별로 빈 줄로 나누었는가",
    "- [ ] 한국어 설명 구간에 일본어·중국어 글자가 한 글자도 없는가(코드/식별자/숫자 제외)",
    "- [ ] 강조가 마크다운 볼드만 사용했는가(작은따옴표 의사 강조가 없는가)",
    "- [ ] 코드 펜스 직전 문장이 콜론으로 끝나지 않고, 「다음과 같습니다」류 filler가 없는가",
    "- [ ] 하나라도 체크 실패면 JSON을 출력하지 말고 regions를 다시 계산",
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
  if (code.startsWith("openrouter_http_") || code.startsWith("requesty_http_")) {
    if (code.toLowerCase().includes("insufficient balance")) {
      return "AI 서비스 잔액이 부족합니다. Requesty 결제/크레딧을 충전해 주세요.";
    }
    return "AI 서비스 요청이 거절되었습니다. API 키·크레딧·네트워크를 확인해 주세요.";
  }
  if (code === "cohort_bundle_submissions_not_array") {
    return "모델이 `submissions`를 배열 형식으로 내지 않았습니다. 다시 시도해 주세요.";
  }
  if (
    code === "cohort_bundle_submission_count_mismatch" ||
    code === "cohort_bundle_missing_submission" ||
    code === "cohort_bundle_unknown_submission" ||
    code === "cohort_bundle_duplicate_submission"
  ) {
    return "모델 응답에 제출 목록이 올바르게 포함되지 않았습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_submission_invalid" || code === "cohort_bundle_submission_id_invalid") {
    return "모델이 낸 제출 항목 형식이 올바르지 않습니다. 다시 시도해 주세요.";
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
  if (code === "cohort_bundle_anchor_not_found") {
    return "모델이 낸 앵커 텍스트를 원문 코드에서 찾지 못했습니다. 앵커는 원문 줄을 그대로 복사해야 합니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_lines_source_invariant") {
    return "제출 코드 줄 분할 데이터가 일관되지 않습니다. 관리자에게 문의해 주세요.";
  }
  return "과제 제출 코드 AI 비교 분석 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
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
    } else {
      assertCohortAnalysisTriggerAllowed({
        dueAt: assignment.dueAt,
        now: new Date(),
        submissionCount,
        existing: existingMeta,
      });
    }

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
          const source = version.code;
          const lines = cohortSubmissionLinesFromSource(source);
          if (lines.join("\n") !== source) {
            throw new Error("cohort_bundle_lines_source_invariant");
          }
          return {
            submissionId: submission.id,
            source,
            lineCount: lines.length,
            lines,
            title: submission.title,
            authorNickname: nickByUserId.get(submission.authorUserId) ?? "",
            versionNo: submission.currentVersionNo,
            language: version.language,
          };
        }),
      };

      const systemPrompt = buildCohortSystemPrompt(reportLocale);
      const userPromptBase = [
        "[INPUT JSON]",
        JSON.stringify(bundleInput),
        "",
        "[OUTPUT GATE]",
        "- 최상위는 반드시 `{ \"reportMarkdown\": \"…\", \"submissions\": [ … ] }` 단 두 키. `response`/`data` 래핑 금지.",
        "- `\"submissions\":` 다음은 반드시 **`[`** 로 시작하는 배열. UUID 객체 맵·`submissions` 문자열 이중 인코딩 금지(검증 실패 `cohort_bundle_submissions_not_array`).",
        "- 올바른 형태: `submissions`는 JSON 배열 `[{ \"submissionId\": \"…\", \"regions\": [...] }, ...]` . 맵 형태는 비권장이며 서버 복구에 의존하지 마라.",
        "- **INPUT JSON에 `lineCount` ≥ 12 인 제출이 하나라도 있으면, 그 제출마다 `regions` 배열 길이는 반드시 2 이상 5 이하.** (정확히 1개만 두는 출력은 전부 실패.)",
        "- **다른 제출은 짧으면 `regions` 1~5개**여도 된다. 제출 간 개수·roleId 집합을 맞추지 않는다.",
        "- **각 제출의 `regions`는 빈 배열 `[]` 로 두지 마라.** 빈 배열이면 서버가 자동으로 코드 전체 한 구역 처리 후 **반드시 `cohort_bundle_regions_semantic_required`** 로 실패한다.",
        "- **`roleId`/`roleLabel`를 빈 문자열로 두지 마라.** 검증기가 해당 객체를 버려 개수가 부족해지면 동일 실패다.",
        "- **12줄 이상 제출에 `regions` 항목을 정확히 1개만 두지 마라.** 역시 동일 실패다.",
        "- `entire_code` / `whole_file` roleId·전체 줄 범위 단일 region을 출력하면 실패다.",
        "- reportMarkdown: 표 금지(HTML `<table>`·Markdown `|` 표·한 줄 파이프 나열·ASCII 격자). 본문에 「표를 쓰지 않는다」 같은 메타 문구 금지. 여러 제출 비교는 같은 `##` 축 안에서 `### [[SUBMISSION:…]]`·목록·단락으로만.",
        "- reportMarkdown: 각 `##` 축마다 ``` 펜스 코드 블록이 있어야 하며, 제출별 비교 문단 직후 근거 스니펫을 둔다.",
        "- reportMarkdown: 펜스는 **해당 제출·해당 region** 앵커 구간 안 원문만. **`##` 제목·본문에 `roleId`·내부 id·JSON 키를 쓰지 말 것.** 구역 연동은 JSON `regions`만.",
        "- reportMarkdown 톤: **친근하게 풀어 설명하는 합니다체.** 통보형 한 줄·명령형 어미·단정 표현 금지. 초등학생도 따라올 수 있게 풀어 쓰고, 한 문단에 3+ 문장이면 `<br />`로 호흡을 준다.",
        "- reportMarkdown 제출 지칭: **반드시 `[[SUBMISSION:<uuid>]]` 태그.** 「Java 제출은」·「JavaScript 제출은」·「Python 제출은」·「C++ 제출은」·「첫 번째 제출은」 같은 언어명·순번-only 지칭은 단 한 번도 쓰지 않는다(태그 자리에 화면에서 작성자 칩이 들어간다). 같은 제출을 여러 번 부를 때도 매번 태그를 다시 넣는다.",
        "- reportMarkdown 라벨 금지: 문단을 「설명:」·「해설:」·「풀이:」·「정리:」·「요약:」·「결과:」 같은 머릿말로 시작하지 않는다. 코드 펜스 앞·뒤도 자연스러운 한국어 평문(또는 짧은 볼드 도입 한 줄)으로 잇는다.",
        "- reportMarkdown 인라인 백틱: 함수명·변수명·짧은 토큰·포맷 문자열·짧은 리터럴(예: `HHMM`, `+10`, `% 100`, `>= 60`, `forEach`, `Map`)은 **반드시 인라인 백틱**으로 감싼다. 한국어 조사·어미는 백틱 밖에 둔다. 한 줄 넘는 코드는 ``` 펜스로만.",
        "- regions: **시간 변환·주말 분기·지각 비교** 등 목적이 다르면 **서로 다른 `roleId`**로 분리한다. 좁은 라벨(예: 「주말 확인」)과 무관한 줄을 같은 앵커에 묶지 마라(색 구역이 논리와 어긋난다).",
        "- reportMarkdown: 개요에서 비교 순서를 적었으면 본문 `##`·각 절 스니펫이 그 축과 **같은 유사영역 판단**을 따른다. 위·아래 기준 불일치 금지.",
        "- reportMarkdown: 시스템에 삽입된 예시 파일 문장·불릿 패턴을 **복사하지 마라.** INPUT 코드만 보고 새로 작성.",
        "- regions 앵커: 각 제출의 `startAnchorText`/`endAnchorText`는 **반드시 그 제출의 입력 `lines` 원문 일부**(연속 줄 전체). 리포트 본문·펜스에서 복사 금지. 구간 첫·마지막 **물리 줄 전체** 복사가 가장 안전.",
        "- 체크리스트를 통과하지 못하면 JSON을 출력하지 말고 regions를 다시 계산한다.",
      ].join("\n");

      const idsSorted = versionRows.map((v) => v.submission.id).sort();

      const { text: rawBundle, tokens } = await llmCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPromptBase },
        ],
        COHORT_REPORT_MODEL(),
        0.2,
      );
      const totalTokens = tokens;
      let parseResult: CohortLlmBundleParsed;
      try {
        parseResult = parseAndValidateCohortBundle(
          rawBundle,
          idsSorted,
          codeBySubmissionId,
          reportLocale,
        );
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : "";
        if (
          code === "cohort_bundle_anchor_not_found" ||
          code === "cohort_bundle_parse_failed" ||
          code === "cohort_bundle_report_missing" ||
          code === "cohort_bundle_submissions_not_array"
        ) {
          this.logger.warn(
            `cohort_pipeline_raw_bundle analysisId=${analysisId}\n${rawBundle}`,
          );
        }
        throw err;
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
