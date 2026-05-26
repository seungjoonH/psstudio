// LeetCode GraphQL 수집·HTML 변환 단위 테스트입니다.
import { describe, expect, it, vi } from "vitest";
import {
  buildLeetCodeAutofillHtml,
  fetchLeetCodeQuestionPayload,
} from "../leetcode-question-fetch.js";

describe("buildLeetCodeAutofillHtml", () => {
  it("__NEXT_DATA__와 og:title을 포함한다", () => {
    const html = buildLeetCodeAutofillHtml({
      title: "Jump Game III",
      difficulty: "Medium",
      contentHtml: "<p>Given an array</p>",
      exampleTestcaseList: ["[4,2,3]"],
      hasCodeSnippets: true,
    });
    expect(html).toContain('id="__NEXT_DATA__"');
    expect(html).toContain("Jump Game III");
    expect(html).toContain("Given an array");
  });
});

describe("fetchLeetCodeQuestionPayload", () => {
  it("GraphQL 응답을 payload로 변환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            question: {
              title: "Jump Game III",
              translatedTitle: null,
              difficulty: "Medium",
              content: "<p>test</p>",
              translatedContent: null,
              exampleTestcaseList: [],
              codeSnippets: [{ langSlug: "typescript", code: "x" }],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await fetchLeetCodeQuestionPayload(
      "jump-game-iii",
      "https://leetcode.com/problems/jump-game-iii/description/?envType=daily-question",
    );

    expect(payload).toEqual({
      title: "Jump Game III",
      difficulty: "Medium",
      contentHtml: "<p>test</p>",
      exampleTestcaseList: [],
      hasCodeSnippets: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://leetcode.com/graphql",
      expect.objectContaining({ method: "POST" }),
    );

    vi.unstubAllGlobals();
  });
});
