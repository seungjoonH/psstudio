// LeetCode GraphQL로 문제 본문을 가져와 자동 채우기용 HTML로 변환합니다.

export type LeetCodeQuestionPayload = {
  title: string;
  difficulty: string;
  contentHtml: string;
  exampleTestcaseList: string[];
  hasCodeSnippets: boolean;
};

type LeetCodeGraphqlQuestion = {
  title?: string;
  translatedTitle?: string | null;
  difficulty?: string;
  content?: string;
  translatedContent?: string | null;
  exampleTestcaseList?: string[];
  codeSnippets?: Array<{ langSlug?: string; code?: string }>;
};

const QUESTION_CONTENT_QUERY = `
query questionContent($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    title
    translatedTitle
    difficulty
    content
    translatedContent
    exampleTestcaseList
    codeSnippets {
      langSlug
      code
    }
  }
}
`.trim();

function resolveLeetCodeSite(hostname: string): "leetcode.com" | "leetcode.cn" {
  const host = hostname.toLowerCase();
  if (host === "leetcode.cn" || host.endsWith(".leetcode.cn")) return "leetcode.cn";
  return "leetcode.com";
}

export function resolveLeetCodeSiteFromUrl(problemUrl: string): "leetcode.com" | "leetcode.cn" {
  try {
    return resolveLeetCodeSite(new URL(problemUrl).hostname);
  } catch {
    return "leetcode.com";
  }
}

function parseGraphqlQuestion(raw: LeetCodeGraphqlQuestion | null | undefined): LeetCodeQuestionPayload | null {
  if (raw === null || raw === undefined) return null;
  const title =
    typeof raw.translatedTitle === "string" && raw.translatedTitle.trim().length > 0
      ? raw.translatedTitle.trim()
      : typeof raw.title === "string"
        ? raw.title.trim()
        : "";
  const contentHtml =
    typeof raw.translatedContent === "string" && raw.translatedContent.trim().length > 0
      ? raw.translatedContent
      : typeof raw.content === "string"
        ? raw.content
        : "";
  const difficulty = typeof raw.difficulty === "string" ? raw.difficulty : "";
  const exampleTestcaseList = Array.isArray(raw.exampleTestcaseList)
    ? raw.exampleTestcaseList
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
  const hasCodeSnippets = Array.isArray(raw.codeSnippets) && raw.codeSnippets.length > 0;
  if (title.length === 0 || contentHtml.trim().length === 0) return null;
  return { title, difficulty, contentHtml, exampleTestcaseList, hasCodeSnippets };
}

/** GraphQL 응답을 기존 __NEXT_DATA__ 파서가 읽을 수 있는 최소 HTML로 감쌉니다. */
export function buildLeetCodeAutofillHtml(payload: LeetCodeQuestionPayload): string {
  const question = {
    title: payload.title,
    difficulty: payload.difficulty,
    content: payload.contentHtml,
    exampleTestcaseList: payload.exampleTestcaseList,
    codeSnippets: payload.hasCodeSnippets ? [{ langSlug: "typescript", code: "" }] : [],
  };
  const nextData = {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [{ state: { data: { question } } }],
        },
      },
    },
  };
  const ogTitle = `${payload.title} - LeetCode`;
  return `<!DOCTYPE html><html lang="en"><head><meta property="og:title" content="${ogTitle.replace(/"/g, "&quot;")}" /></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

export async function fetchLeetCodeQuestionPayload(
  titleSlug: string,
  problemUrl: string,
): Promise<LeetCodeQuestionPayload | null> {
  const slug = titleSlug.trim();
  if (slug.length === 0) return null;

  const site = resolveLeetCodeSiteFromUrl(problemUrl);
  const graphqlUrl = `https://${site}/graphql`;

  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      body: JSON.stringify({
        query: QUESTION_CONTENT_QUERY,
        variables: { titleSlug: slug },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { question?: LeetCodeGraphqlQuestion | null };
    };
    return parseGraphqlQuestion(body.data?.question ?? null);
  } catch {
    return null;
  }
}

export async function fetchLeetCodeAutofillHtml(titleSlug: string, problemUrl: string): Promise<string> {
  const payload = await fetchLeetCodeQuestionPayload(titleSlug, problemUrl);
  if (payload === null) return "";
  return buildLeetCodeAutofillHtml(payload);
}
