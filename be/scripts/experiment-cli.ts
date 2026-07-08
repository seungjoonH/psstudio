// experiments 패키지가 prod 프롬프트·응답 평가를 호출하는 CLI입니다.
import { readFileSync } from "node:fs";
import {
  buildAutofillSystemPrompt,
  buildAutofillUserPrompt,
} from "../src/modules/assignments/assignments.service.js";
import type { ProblemPlatform } from "@psstudio/shared";
import { buildSubmissionReviewLlmMessages } from "../src/experiment/submission-review-llm-messages.js";
import { parseAiReviewPayload } from "../src/modules/submissions/submissions.service.js";

type AutofillFixtureInput = {
  problemUrl: string;
  platform: ProblemPlatform;
  contextText: string;
  hintLocale?: "ko" | "en";
};

type ReviewFixtureInput = {
  code: string;
  noteMarkdown: string;
  codeLanguage: string;
  assignmentContext: {
    title: string;
    problemUrl: string;
    platform: string;
    difficulty: string | null;
    hintPlain: string;
  };
  problemContext: {
    summary: string;
    input: string;
    output: string;
  } | null;
};

function readStdinJson<T>(): T {
  const raw = readFileSync(0, "utf8");
  return JSON.parse(raw) as T;
}

function cmdBuildMessages() {
  const track = process.argv[3];
  const input = readStdinJson<AutofillFixtureInput | ReviewFixtureInput>();
  if (track === "autofill") {
    const f = input as AutofillFixtureInput;
    const locale = f.hintLocale ?? "ko";
    process.stdout.write(
      JSON.stringify({
        temperature: 0.2,
        maxTokens: null,
        messages: [
          { role: "system", content: buildAutofillSystemPrompt(locale) },
          {
            role: "user",
            content: buildAutofillUserPrompt(locale, f.problemUrl, f.platform, f.contextText),
          },
        ],
      }),
    );
    return;
  }
  if (track === "review") {
    const f = input as ReviewFixtureInput;
    const built = buildSubmissionReviewLlmMessages(
      f.code,
      f.noteMarkdown,
      f.assignmentContext,
      f.problemContext,
      f.codeLanguage,
    );
    process.stdout.write(JSON.stringify(built));
    return;
  }
  throw new Error(`unknown track: ${track}`);
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cmdEvalAutofill() {
  const { content, expectedStatus } = readStdinJson<{ content: string; expectedStatus: string }>();
  const parsed = extractJsonObject(content) as Record<string, unknown> | null;
  const errors: string[] = [];
  if (parsed === null) {
    errors.push("JSON 파싱 실패");
  } else {
    for (const key of ["status", "hint", "algorithms", "difficulty"]) {
      if (!(key in parsed)) errors.push(`필수 키 누락: ${key}`);
    }
    if (typeof parsed.status === "string" && parsed.status !== expectedStatus) {
      errors.push(`status 불일치 (기대 ${expectedStatus}, 실제 ${parsed.status})`);
    }
  }
  process.stdout.write(JSON.stringify({ valid: errors.length === 0, errors, parsed }));
}

function cmdEvalReview() {
  const { content, code } = readStdinJson<{ content: string; code: string }>();
  const payload = parseAiReviewPayload(content, code);
  const modelLineCount = Array.isArray((extractJsonObject(content) as { lineComments?: unknown[] } | null)?.lineComments)
    ? ((extractJsonObject(content) as { lineComments: unknown[] }).lineComments.length)
    : 0;
  const matchedLineComments = payload.lineComments.length;
  const errors: string[] = [];
  if (payload.summary.includes("AI 리뷰 응답 형식을 해석하지 못했습니다")) {
    errors.push("JSON 파싱 실패(summary 폴백)");
  }
  process.stdout.write(
    JSON.stringify({
      valid: errors.length === 0,
      errors,
      summary: payload.summary,
      lineComments: payload.lineComments,
      anchorStats: {
        modelLineCount,
        matchedLineComments,
        anchorMatchRate: modelLineCount > 0 ? matchedLineComments / modelLineCount : null,
      },
    }),
  );
}

const cmd = process.argv[2];
if (cmd === "build-messages") cmdBuildMessages();
else if (cmd === "eval-autofill") cmdEvalAutofill();
else if (cmd === "eval-review") cmdEvalReview();
else {
  process.stderr.write("usage: experiment-cli.ts build-messages <autofill|review>\n");
  process.stderr.write("       experiment-cli.ts eval-autofill\n");
  process.stderr.write("       experiment-cli.ts eval-review\n");
  process.exit(1);
}
