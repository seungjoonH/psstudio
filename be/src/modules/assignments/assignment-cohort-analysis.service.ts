// 과제 집단 코드 비교 분석 트리거·파이프라인·조회를 담당하는 서비스입니다.
import { Injectable, NotFoundException } from "@nestjs/common";
import { type DataSource, In, IsNull } from "typeorm";
import { dataSource } from "../../config/data-source.js";
import { ENV } from "../../config/env.js";
import { Submission } from "../submissions/submission.entity.js";
import { SubmissionVersion } from "../submissions/submission-version.entity.js";
import { User } from "../users/user.entity.js";
import { Assignment } from "./assignment.entity.js";
import { AssignmentCohortAnalysisMember } from "./assignment-cohort-analysis-member.entity.js";
import { AssignmentCohortAnalysis } from "./assignment-cohort-analysis.entity.js";
import { assertCohortAnalysisTriggerAllowed } from "./assignment-cohort-analysis.policy.js";
import {
  type CohortArtifactsV2,
  type CohortReportLocale,
  parseAndValidateCohortBundle,
} from "./cohort-analysis-bundle.js";
import { Group } from "../groups/group.entity.js";

/** 리포트·번들 생성은 문제 메타 추론과 동일한 모델 키를 씁니다(추가 env 없음). */
const COHORT_REPORT_MODEL = () => ENV.llmModelProblemAnalyze();

export type CohortArtifactsLegacy = {
  normalizedBySubmission: Record<string, { files: { main: string }; originalLanguage: string }>;
  pairwiseDiffs: Array<{ submissionIdA: string; submissionIdB: string; file: string; diffText: string }>;
  deadSpansBySubmission: Record<string, { line: number; endLine?: number }[]>;
};

function targetLanguageInstruction(targetLanguage: string): string {
  switch (targetLanguage) {
    case "pseudo":
      return "의사코드(pseudo). 문법은 느슨해도 되지만 제어 구조·연산이 명확해야 한다.";
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
    ].join(" ");
  }
  return [
    "reportMarkdown과 각 regions의 roleLabel은 한국어로 작성한다.",
    "문체는 합니다·입니다체를 쓰고, 중학생도 이해할 수 있게 짧은 문장으로 설명한다.",
  ].join(" ");
}

export type CohortAnalysisPublicDto = {
  status: "NONE" | "RUNNING" | "DONE" | "FAILED";
  targetLanguage?: string;
  reportLocale?: string | null;
  failureReason?: string | null;
  reportMarkdown?: string | null;
  artifacts?: CohortArtifactsV2 | CohortArtifactsLegacy | Record<string, unknown>;
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

@Injectable()
export class AssignmentCohortAnalysisService {
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
      base.artifacts = row.artifacts as unknown as CohortArtifactsV2 | CohortArtifactsLegacy | Record<string, unknown>;
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

  async trigger(assignmentId: string, userId: string, reportLocale: CohortReportLocale): Promise<CohortAnalysisPublicDto> {
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
    assertCohortAnalysisTriggerAllowed({
      translationLanguage: group.ruleTranslationLanguage,
      dueAt: assignment.dueAt,
      now: new Date(),
      submissionCount,
      existing: existing !== null ? { status: existing.status } : null,
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
        "[reportMarkdown]",
        "- 마크다운으로 작성한다.",
        "- 제출을 언급할 때는 반드시 플레이스홀더만 쓴다: [[SUBMISSION:<submissionId>]] 형식(UUID는 입력에 나온 submissionId 그대로).",
        "- 본문 일반 텍스트에 UUID를 노출하지 않는다.",
        cohortLocaleInstruction(reportLocale),
        "- 모델명·프롬프트·시스템·버전·시드 등 구성 메타는 절대 언급하지 않는다.",
        "- 표절 단정·실력 평가·정답 판정은 하지 않는다.",
        "- 알고리즘·자료구조·구현 방식 차이를 중심으로 서술한다.",
        "",
        "[submissions 배열]",
        "각 원소: submissionId, normalizedCode, originalLanguage, regions.",
        "- submissionId는 입력과 동일해야 한다. 모든 제출을 빠짐없이 포함한다.",
        `- normalizedCode: 그룹 공통 표현 목표에 맞게 변환한 전체 코드 문자열이다. ${langHint}`,
        "- 의미(로직)는 바꾸지 않는다. 주석·문서 문자열은 넣지 않는다.",
        "- 원본 언어와 목표가 같아도 가독성 있게 줄바꿈·들여쓰기를 넣고, 한 줄로 압축하지 않는다.",
        "",
        "[regions]",
        "- 각 구역: roleId(영문 스네이크 케이스 등 짧은 식별자), roleLabel(사람이 읽는 이름), startLine, endLine.",
        "- 1-based 줄 번호. normalizedCode를 줄 단위로 나눈 범위 안에 있어야 한다.",
        "- 동일한 의미·역할의 코드 블록은 **모든 제출에서 같은 roleId**를 재사용한다.",
        "- 서로 다른 제출에서 대응되는 부분은 같은 roleId로 묶는다.",
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
      const { reportMarkdown, artifacts } = parseAndValidateCohortBundle(rawBundle, idsSorted, target);

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
    } catch {
      await this.ds.getRepository(AssignmentCohortAnalysis).update(analysisId, {
        status: "FAILED",
        failureReason: "집단 코드 비교 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        finishedAt: new Date(),
      });
    }
  }
}
