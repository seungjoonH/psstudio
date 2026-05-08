// 과제 집단 코드 비교 분석 트리거·파이프라인·조회를 담당하는 서비스입니다.
import { Injectable, NotFoundException } from "@nestjs/common";
import { createTwoFilesPatch } from "diff";
import { jsonrepair } from "jsonrepair";
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
import { Group } from "../groups/group.entity.js";

/** 리포트 생성은 문제 메타 추론과 동일한 모델 키를 씁니다(추가 env 없음). */
const COHORT_REPORT_MODEL = () => ENV.llmModelProblemAnalyze();

type NormalizedEntry = {
  files: { main: string };
  originalLanguage: string;
};

type PairwiseDiff = {
  submissionIdA: string;
  submissionIdB: string;
  file: string;
  diffText: string;
};

type CohortArtifacts = {
  normalizedBySubmission: Record<string, NormalizedEntry>;
  pairwiseDiffs: PairwiseDiff[];
  deadSpansBySubmission: Record<string, { line: number; endLine?: number }[]>;
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… (truncated)`;
}

function targetLanguageInstruction(targetLanguage: string): string {
  switch (targetLanguage) {
    case "pseudo":
      return "의사코드(pseudo). 문법은 느슨해도 되지만 제어 구조·연산이 명확해야 한다.";
    case "python":
      return "Python 3 문법으로, 실행 가능한 한 줄 단위 코드.";
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
      return `${targetLanguage} 문법에 맞는 코드.`;
  }
}

function parseNormalizedCodeJson(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenced !== null) candidates.push(fenced[1].trim());
  candidates.push(trimmed);
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.length === 0 || seen.has(c)) continue;
    seen.add(c);
    try {
      const obj = JSON.parse(jsonrepair(c)) as { normalizedCode?: unknown };
      if (typeof obj.normalizedCode === "string" && obj.normalizedCode.trim().length > 0) {
        return obj.normalizedCode.trim();
      }
    } catch {
      /* try next */
    }
  }
  return null;
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

export type CohortAnalysisPublicDto = {
  status: "NONE" | "RUNNING" | "DONE" | "FAILED";
  targetLanguage?: string;
  failureReason?: string | null;
  reportMarkdown?: string | null;
  artifacts?: CohortArtifacts;
  tokenUsed?: number;
  includedSubmissions?: Array<{
    submissionId: string;
    versionNo: number;
    authorUserId: string;
    authorNickname: string;
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
      failureReason: row.failureReason,
      reportMarkdown: row.reportMarkdown,
      tokenUsed: row.tokenUsed,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
    if (row.status === "DONE") {
      base.artifacts = row.artifacts as unknown as CohortArtifacts;
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
        base.includedSubmissions = members.map((m) => {
          const author = subById.get(m.submissionId)?.authorUserId ?? "";
          return {
            submissionId: m.submissionId,
            versionNo: verNoById.get(m.submissionVersionId) ?? 0,
            authorUserId: author,
            authorNickname: nick.get(author) ?? "",
          };
        });
      }
    }
    return base;
  }

  async trigger(assignmentId: string, userId: string): Promise<CohortAnalysisPublicDto> {
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

      let totalTokens = 0;
      const normalizedBySubmission: Record<string, NormalizedEntry> = {};
      const target = analysis.targetLanguage;
      const langHint = targetLanguageInstruction(target);

      for (const { submission, version } of versionRows) {
        const { text, tokens } = await openRouterCompletion(
          [
            {
              role: "system",
              content: [
                "너는 알고리즘 제출 코드를 정규화하는 도구다.",
                "출력은 반드시 JSON 한 개만: {\"normalizedCode\": string}",
                "normalizedCode에는 주석·문서화 문자열을 넣지 않는다.",
                "동작 의미(로직)는 절대 바꾸지 않는다.",
                "이름·선언 방식 등 스타일만 과제 그룹 공통 표면에 맞게 통일한다.",
                `목표 표현: ${langHint}`,
                "원본 언어와 목표가 같아도 불필요한 공백·스타일 차이는 줄인다.",
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                `[원본 언어] ${version.language}`,
                `[목표 공통 언어 키] ${target}`,
                "",
                "```",
                version.code,
                "```",
              ].join("\n"),
            },
          ],
          ENV.llmModelTranslation(),
          0.15,
        );
        totalTokens += tokens;
        const normalized = parseNormalizedCodeJson(text);
        if (normalized === null) {
          throw new Error("normalize_parse_failed");
        }
        normalizedBySubmission[submission.id] = {
          files: { main: normalized },
          originalLanguage: version.language,
        };
      }

      const ids = versionRows.map((v) => v.submission.id).sort();
      const pairwiseDiffs: PairwiseDiff[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const idA = ids[i];
          const idB = ids[j];
          const codeA = normalizedBySubmission[idA]?.files.main ?? "";
          const codeB = normalizedBySubmission[idB]?.files.main ?? "";
          const diffText = createTwoFilesPatch(
            `submissions/${idA}/main`,
            `submissions/${idB}/main`,
            codeA,
            codeB,
            "",
            "",
            { context: 3 },
          );
          pairwiseDiffs.push({ submissionIdA: idA, submissionIdB: idB, file: "main", diffText });
        }
      }

      const summaryForReport = ids
        .map((id) => {
          const code = normalizedBySubmission[id]?.files.main ?? "";
          return `### submission ${id}\n${clip(code, 6000)}`;
        })
        .join("\n\n");
      const diffSample = pairwiseDiffs
        .slice(0, 15)
        .map((d) => clip(d.diffText, 4000))
        .join("\n\n---\n\n");

      const { text: reportMd, tokens: reportTokens } = await openRouterCompletion(
        [
          {
            role: "system",
            content: [
              "너는 스터디 그룹 과제 제출 코드를 비교 분석해 긴 Markdown 리포트 한 편을 쓴다.",
              "한국어로 작성한다.",
              "모델명·프롬프트·시스템·버전·시드 등 구성 메타는 절대 언급하지 않는다.",
              "표절 단정·실력 평가·정답 판정은 하지 않는다.",
              "알고리즘·자료구조 차이, 구현 방식 차이(예: 재귀 vs 반복, 내장 API vs 직접 구현)를 중심으로 서술한다.",
              "가독성: 제목(# ## ###), 목록, 짧은 문단을 쓴다.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "[정규화된 제출 요약 — 파일 main 기준]",
              summaryForReport,
              "",
              "[정규화본 pairwise diff 일부]",
              diffSample.length > 0 ? diffSample : "(diff 없음)",
            ].join("\n"),
          },
        ],
        COHORT_REPORT_MODEL(),
        0.25,
      );
      totalTokens += reportTokens;

      const artifacts: CohortArtifacts = {
        normalizedBySubmission,
        pairwiseDiffs,
        deadSpansBySubmission: Object.fromEntries(ids.map((id) => [id, [] as { line: number; endLine?: number }[]])),
      };

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
        rowDone.reportMarkdown = reportMd.trim().length > 0 ? reportMd.trim() : "(리포트가 비었습니다.)";
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
