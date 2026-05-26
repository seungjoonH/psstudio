// LeetCode AI 자동 채우기 파싱 회귀를 막는 테스트입니다.
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestLlmChatMock } = vi.hoisted(() => ({
  requestLlmChatMock: vi.fn(),
}));

vi.mock("../../../config/env.js", () => ({
  ENV: {
    databaseUrl: () => "postgres://test:test@localhost:5432/test",
    llmModelAssignmentAutofill: () => "test-assignment-autofill-model",
  },
}));

vi.mock("../../ai/llm-chat-client.js", () => ({
  requestLlmChat: requestLlmChatMock,
}));

import { AssignmentsService } from "../assignments.service.js";

const assignments = new AssignmentsService();

const LEETCODE_GRAPHQL_TWO_SUM = {
  title: "Two Sum",
  translatedTitle: null,
  difficulty: "Easy",
  content:
    "<p>Given an array of integers <code>nums</code> and an integer <code>target</code>, return the indices of the two numbers such that they add up to <code>target</code>.</p><p><strong class=\"example\">Example 1:</strong></p><pre><strong>Input:</strong> nums = [2,7,11,15], target = 9<strong>Output:</strong> [0,1]</pre><p><strong>Constraints:</strong></p><ul><li>2 &lt;= nums.length &lt;= 10^4</li></ul>",
  translatedContent: null,
  exampleTestcaseList: ["[2,7,11,15]\n9"],
  codeSnippets: [{ langSlug: "typescript", code: "function twoSum() {}" }],
};

function mockLeetCodeGraphqlFetch(question = LEETCODE_GRAPHQL_TWO_SUM) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | { url: string }, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/graphql") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { question } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("", { status: 403 });
    }),
  );
}

const PROGRAMMERS_HTML = String.raw`<!DOCTYPE html>
<html lang="ko">
  <head>
    <title>코딩테스트 연습 - 두 수 더하기 | 프로그래머스 스쿨</title>
  </head>
  <body>
    <div
      data-controller="lessons"
      class="lesson-content"
      data-lesson-id="120000"
      data-lesson-title="두 수 더하기"
      data-challenge-level="1"
    >
      <div class="challenge-content">
        <h3>문제 설명</h3>
        <p>정수 num1과 num2가 주어질 때, 두 수의 합을 return 하도록 solution 함수를 완성해주세요.</p>
        <h3>제한사항</h3>
        <p>-50000 ≤ num1 ≤ 50000</p>
        <p>-50000 ≤ num2 ≤ 50000</p>
      </div>
      <div class="run-section"></div>
    </div>
  </body>
</html>`;

describe("AssignmentsService.autofillFromAi", () => {
  afterEach(() => {
    requestLlmChatMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("LeetCode GraphQL로 description·쿼리 URL 자동 채우기를 수행한다", async () => {
    mockLeetCodeGraphqlFetch();
    requestLlmChatMock.mockResolvedValue({
      content: JSON.stringify({
        status: "ok",
        title: "",
        hint: "해시 맵에 이전 값들을 저장하면서 보수를 찾으면 한 번 순회로 해결할 수 있다.",
        algorithms: ["해시"],
        difficulty: "Hard",
      }),
    });

    const result = await assignments.autofillFromAi(
      "https://leetcode.com/problems/two-sum/description/?envType=daily-question&envId=2026-05-17",
      "ko",
    );

    expect(result).toEqual({
      title: "Two Sum",
      hint: "해시 맵에 이전 값들을 저장하면서 보수를 찾으면 한 번 순회로 해결할 수 있다.",
      algorithms: ["해시"],
      difficulty: "Easy",
    });
    expect(requestLlmChatMock).toHaveBeenCalledOnce();
    const llmRequest = requestLlmChatMock.mock.calls[0]?.[0];
    expect(llmRequest.messages[1]?.content).toContain("제목: Two Sum");
    expect(llmRequest.messages[1]?.content).toContain("난이도: Easy");
    expect(llmRequest.messages[1]?.content).toContain("hint와 reason은 한국어로 작성해라.");
    expect(llmRequest.messages[1]?.content).toContain("입력:");
    expect(llmRequest.messages[1]?.content).toContain("출력:");
  });

  it("영문 locale이면 영어 힌트 작성을 프롬프트에 명시한다", async () => {
    mockLeetCodeGraphqlFetch();
    requestLlmChatMock.mockResolvedValue({
      content: JSON.stringify({
        status: "ok",
        title: "",
        hint: "Store seen values in a hash map and look up the complement while iterating once.",
        algorithms: ["해시"],
        difficulty: "Medium",
      }),
    });

    const result = await assignments.autofillFromAi(
      "https://leetcode.com/problems/two-sum/description/",
      "en",
    );

    expect(result.hint).toBe(
      "Store seen values in a hash map and look up the complement while iterating once.",
    );
    const llmRequest = requestLlmChatMock.mock.calls[0]?.[0];
    expect(llmRequest.messages[0]?.content).toContain("Write hint and reason in English.");
    expect(llmRequest.messages[1]?.content).toContain("Write hint and reason in English.");
  });

  it("영어 사용자가 Programmers 링크를 요청해도 영어 지시문으로 프롬프트를 만든다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(PROGRAMMERS_HTML, { status: 200 })));
    requestLlmChatMock.mockResolvedValue({
      content: JSON.stringify({
        status: "ok",
        title: "",
        hint: "Just return the sum of the two integers directly.",
        algorithms: ["구현"],
        difficulty: "Lv. 1",
      }),
    });

    const result = await assignments.autofillFromAi(
      "https://school.programmers.co.kr/learn/courses/30/lessons/120000",
      "en",
    );

    expect(result).toEqual({
      title: "두 수 더하기",
      hint: "Just return the sum of the two integers directly.",
      algorithms: ["구현"],
      difficulty: "Lv. 1",
    });
    const llmRequest = requestLlmChatMock.mock.calls[0]?.[0];
    expect(llmRequest.messages[0]?.content).toContain("You are an algorithm assignment autofill assistant.");
    expect(llmRequest.messages[1]?.content).toContain("Platform: Programmers");
    expect(llmRequest.messages[1]?.content).toContain("Keep title as \"\" only");
    expect(llmRequest.messages[1]?.content).toContain("Write hint and reason in English.");
  });
});
