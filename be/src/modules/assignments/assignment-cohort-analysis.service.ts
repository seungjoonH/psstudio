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
  type CohortReportLocale,
  parseAndValidateCohortBundle,
} from "./cohort-analysis-bundle.js";
import { Group } from "../groups/group.entity.js";

/** 리포트·번들 생성은 문제 메타 추론과 동일한 모델 키를 씁니다(추가 env 없음). */
const COHORT_REPORT_MODEL = () => ENV.llmModelProblemAnalyze();

function targetLanguageInstruction(targetLanguage: string): string {
  switch (targetLanguage) {
    case "pseudo":
      return "의사코드(pseudo). 컴파일은 하지 않으며, 제어 구조·자료 접근·연산이 한눈에 드러나게 쓴다.";
    case "python":
      return "Python 3 문법으로, 실행 가능한 코드.";
    case "java":
      return "Java 문법으로, 실행 가능한 코드.";
    case "cpp":
      return "C++ 문법으로, 실행 가능한 코드.";
    case "javascript":
      return "JavaScript 문법으로, 실행 가능한 코드.";
    case "typescript":
      return "TypeScript 문법으로, 실행 가능한 코드.";
    case "c":
      return "C 문법으로, 실행 가능한 코드.";
    default:
      return `${targetLanguage} 문법에 맞는 실행 가능한 코드.`;
  }
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
    ].join(" ");
  }
  return [
    "reportMarkdown 전체(제목·소제목·본문·목록·표 설명·코드 펜스 바깥 문장)는 한국어로만 작성한다. 영어만으로 된 장문 설명이나 영어 제목만 있는 절은 쓰지 않는다.",
    "함수명·API 이름 등 코드 식별자는 원문을 남겨도 되지만, 그 전후 서술은 한국어이다.",
    "각 regions의 roleLabel도 한국어 짧은 이름으로 작성한다.",
    "문체는 합니다·입니다체를 쓰고, 중학생도 이해할 수 있게 짧은 문장으로 설명한다.",
  ].join(" ");
}

export type CohortAnalysisPublicDto = {
  status: "NONE" | "RUNNING" | "DONE" | "FAILED";
  targetLanguage?: string;
  reportLocale?: string | null;
  failureReason?: string | null;
  reportMarkdown?: string | null;
  artifacts?: CohortAnalysisArtifactsDto | Record<string, unknown>;
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
  if (code === "cohort_bundle_normalized_language_mismatch") {
    return "모델이 그룹 공통 언어로 코드를 통일하지 못했습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_report_fence_mismatch") {
    return "리포트 코드 블록이 그룹 공통 언어 태그와 맞지 않습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_report_original_language_mentioned") {
    return "리포트에 원문 언어 설명이 섞였습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_count") {
    return "모델이 구역(regions) 개수 규칙(제출당 1~5개)을 지키지 못했습니다. 다시 시도해 주세요.";
  }
  if (code === "cohort_bundle_regions_role_mismatch") {
    return "모델이 제출 간 동일한 roleId 집합으로 구역을 맞추지 못했습니다. 다시 시도해 주세요.";
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
  return "집단 코드 비교 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
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
      targetLanguage: row.targetLanguage,
      reportLocale: row.reportLocale,
      failureReason: row.failureReason,
      reportMarkdown: row.reportMarkdown,
      tokenUsed: row.tokenUsed,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
    if (row.status === "DONE") {
      base.artifacts = row.artifacts as unknown as CohortAnalysisArtifactsDto | Record<string, unknown>;
      const members = await this.ds.getRepository(AssignmentCohortAnalysisMember).find({
        where: { cohortAnalysisId: row.id },
      });
      if (members.length === 0) {
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
    const group = await this.ds.getRepository(Group).findOne({ where: { id: assignment.groupId } });
    if (group === null || group.deletedAt !== null) {
      throw new NotFoundException("그룹을 찾을 수 없습니다.");
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
        translationLanguage: group.ruleTranslationLanguage,
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
        targetLanguage: group.ruleTranslationLanguage,
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
      translationLanguage: group.ruleTranslationLanguage,
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
        targetLanguage: group.ruleTranslationLanguage,
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
      existing.targetLanguage = group.ruleTranslationLanguage;
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

      const target = analysis.targetLanguage;
      const langHint = targetLanguageInstruction(target);
      const reportLocale: CohortReportLocale =
        analysis.reportLocale === "en" || analysis.reportLocale === "ko" ? analysis.reportLocale : "ko";

      const bundleInput = {
        assignmentTitle: assignment.title,
        targetLanguageKey: target,
        targetLanguageHint: langHint,
        mandatoryRule:
          "모든 submissions[].normalizedCode는 원본 언어와 무관하게 **오직 targetLanguageKey 한 가지 문법**으로만 작성한다. " +
          "Java·C++·Python 등으로 제출되었더라도 전부 같은 문법으로 변환한다. 한 제출만 다른 문법 흔적(예: target이 Java인데 let/화살표 함수, target이 JS인데 public class 등)을 남기면 **실패한 응답**이다. " +
          "이름·공백·괄호 스타일만 다른 **무의미한 차이**는 줄이고, **알고리즘·자료구조·반복·분기·데이터 흐름** 등 의미 있는 차이만 드러나게 정규화한다. " +
          "reportMarkdown에서는 원본 언어 이름(Java·C++ 등)을 **한 번도 쓰지 말고**, 통일된 코드 기준으로만 비교한다.",
        reportLocale,
        submissions: versionRows.map(({ submission, version }) => ({
          submissionId: submission.id,
          title: submission.title,
          authorNickname: nickByUserId.get(submission.authorUserId) ?? "",
          versionNo: submission.currentVersionNo,
          originalLanguage: version.language,
          code: version.code,
        })),
      };

      const systemPrompt = [
        "너는 스터디 그룹 과제 제출 코드를 한 번에 정규화·구역 분할·비교 설명까지 수행한다.",
        "출력은 반드시 유효한 JSON 객체 한 개만이다. 앞뒤 설명·마크다운 코드펜스로 감싸지 않는 것이 좋다(순수 JSON).",
        '키: "reportMarkdown"(string), "submissions"(배열).',
        "",
        "[정규화 언어 — 최우선]",
        `- 사용자 JSON의 targetLanguageKey는 "${target}" 이다. 모든 제출의 normalizedCode는 이 키에 대응하는 **단일 문법**으로만 쓴다(의사코드면 모두 pseudo 스타일).`,
        `- ${langHint}`,
        "- 원본이 서로 다른 언어여도 **절대** 원문 문법을 유지하지 않는다. (예: target이 python이면 전부 Python 3, 일부만 Java로 두지 않는다.)",
        "- 실제 언어 target이면 **그 언어에 맞는 문법만** 쓴다. 다른 언어 관용(예: Java 클래스 뼈대 + JavaScript 키워드 혼합)은 금지이다.",
        "- reportMarkdown 안의 코드 펜스 언어 태그도 동일한 목표 언어에 맞춘다.",
        "",
        "[reportMarkdown]",
        "- 마크다운으로 작성한다.",
        "- 피드백은 **목표 언어로 정규화된 코드 기준**으로만 한다. **알고리즘·시간 복잡도·분기·반복·데이터 흐름·역할 구역(roleId) 대응**처럼 로직 차이만 설명한다.",
        "- 제출이 원래 어떤 프로그래밍 언어(Java·C++·Python·JavaScript 등)·문법으로 작성되었는지 **절대 언급하지 않는다.** \"OO 언어로 작성\", \"XX 문법에 맞게\" 같은 문장도 금지이다.",
        "- 제출을 언급할 때는 반드시 플레이스홀더만 쓴다: [[SUBMISSION:<submissionId>]] 형식(UUID는 입력에 나온 submissionId 그대로).",
        "- 본문 일반 텍스트에 UUID를 노출하지 않는다. submission <uuid>, 괄호만 감싼 UUID 등 다른 형태도 쓰지 않는다.",
        "- 각 제출을 논할 때 해당 제출을 가리키는 [[SUBMISSION:<submissionId>]]를 그 논점 근처(문단 앞이나 요약 문장 안)에 반드시 한 번 이상 넣어 어떤 코드인지 드러낸다.",
        `- 코드 펜스는 **반드시 targetLanguageKey("${target}")에 맞는 언어 태그 한 종류만** 쓴다. 원문 언어 태그(예: target이 python일 때 \`\`\`java) 금지.`,
        "- **어느 제출의 normalizedCode 전체도 리포트에 붙이지 않는다.** 가로 비교 영역이 전체 코드를 담당한다. 펜스에는 **설명과 직접 연결되는 발췌**만 넣는다(줄 수 제한은 없으나 전체 파일 복사 금지).",
        "- 각 발췌는 직전·직후 문장과 논리적으로 이어져야 하며, [[SUBMISSION:id]]와 함께 **해당 구역의 roleId(백틱으로 감싼 짧은 식별자)**를 본문에서 한 번 이상 언급해, 리포트와 구역 색 대응이 드러나게 한다.",
        "- 발췌 내용·의미는 submissions.normalizedCode와 같아야 하며 과장·변형 금지.",
        "- 코드 펜스 바로 위 문장에서 어떤 제출인지 [[SUBMISSION:id]]로 연결하거나, 직전 문단에서 해당 플레이스홀더를 넣는다.",
        cohortLocaleInstruction(reportLocale),
        "- 모델명·프롬프트·시스템·버전·시드 등 구성 메타는 절대 언급하지 않는다.",
        "- 표절 단정·실력 평가·정답 판정은 하지 않는다.",
        "- 알고리즘·자료구조·구현 방식 차이를 중심으로 서술한다.",
        "",
        "[submissions 배열]",
        "각 원소: submissionId, normalizedCode, originalLanguage, regions.",
        "- submissionId는 입력과 동일해야 한다. 모든 제출을 빠짐없이 포함한다.",
        `- normalizedCode: **반드시 targetLanguageKey("${target}") 문법만** 사용한 전체 코드 문자열이다. ${langHint}`,
        "- originalLanguage는 입력과 동일한 **원본 제출 언어 키**만 적는다(감사·추적용). normalizedCode의 문법과 혼동하지 않는다.",
        "- 의미(로직)는 바꾸지 않는다. 주석·문서 문자열은 넣지 않는다.",
        "- 원본 언어와 목표가 같아도 가독성 있게 줄바꿈·들여쓰기를 넣고, 한 줄로 압축하지 않는다.",
        "",
        "[regions]",
        "- 각 구역: roleId(영문 스네이크 케이스 등 짧은 식별자, **네가 비교 축을 정해 새로 짓는다**. 고정 목록을 따르지 않는다), roleLabel(그 구역을 한 줄로 설명하는 이름), startLine, endLine.",
        "- **제출마다 구역 개수는 1개 이상 5개 이하**이다. 함수 시그니처·전처리·핵심 알고리즘·주 반복/분기 덩어리 등 **의미 단위**로만 나눈다.",
        "- **한 줄마다 구역을 나누지 않는다.** 문법 토큰 단위로 쪼개면 실패한 응답이다.",
        "- 1-based 줄 번호. normalizedCode 줄 범위 안에 완전히 들어가야 한다.",
        "- **비교하려는 같은 논점**은 모든 제출에서 **동일한 roleId**를 쓴다. 제출 A의 구역 집합(roleId 목록)이 제출 B와 **완전히 같아야** 한다(개수·이름 모두).",
        "- roleId `whole_file` 및 이와 같은 ‘전체 한 덩어리’ 예약어는 쓰지 않는다.",
      ].join("\n");

      const userPrompt = JSON.stringify(bundleInput);

      const { text: rawBundle, tokens } = await openRouterCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        COHORT_REPORT_MODEL(),
        0.2,
      );

      const idsSorted = versionRows.map((v) => v.submission.id).sort();
      const { reportMarkdown, artifacts } = parseAndValidateCohortBundle(
        rawBundle,
        idsSorted,
        target,
        reportLocale,
      );

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
        rowDone.tokenUsed = tokens;
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
