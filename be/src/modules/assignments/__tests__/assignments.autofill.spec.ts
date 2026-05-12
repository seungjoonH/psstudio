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

const LEETCODE_TWO_SUM_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Two Sum - LeetCode</title>
    <meta property="og:title" content="Two Sum - LeetCode" />
  </head>
  <body>
    <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"dehydratedState":{"queries":[{"state":{"data":{"question":{"title":"Two Sum","difficulty":"Easy","content":"\u003cp\u003eGiven an array of integers \u003ccode\u003enums\u003c/code\u003e and an integer \u003ccode\u003etarget\u003c/code\u003e, return the indices of the two numbers such that they add up to \u003ccode\u003etarget\u003c/code\u003e.\u003c/p\u003e\u003cp\u003e\u003cstrong class=\"example\"\u003eExample 1:\u003c/strong\u003e\u003c/p\u003e\u003cpre\u003e\u003cstrong\u003eInput:\u003c/strong\u003e nums = [2,7,11,15], target = 9\u003cstrong\u003eOutput:\u003c/strong\u003e [0,1]\u003c/pre\u003e\u003cp\u003e\u003cstrong\u003eConstraints:\u003c/strong\u003e\u003c/p\u003e\u003cul\u003e\u003cli\u003e2 \u0026lt;= nums.length \u0026lt;= 10^4\u003c/li\u003e\u003c/ul\u003e","exampleTestcaseList":["[2,7,11,15]\n9"],"codeSnippets":[{"langSlug":"typescript","code":"function twoSum(nums: number[], target: number): number[] {\\n    \\n};"}]}}}}]}}}}</script>
  </body>
</html>`;

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

  it("__NEXT_DATA__ 기반 LeetCode HTML에서도 자동 채우기를 계속한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(LEETCODE_TWO_SUM_HTML, { status: 200 })),
    );
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
      "https://leetcode.com/problems/two-sum/description/",
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(LEETCODE_TWO_SUM_HTML, { status: 200 })),
    );
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
