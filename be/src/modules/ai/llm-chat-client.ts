// OpenRouter/Requesty LLM 채팅 호출을 공통 처리하는 클라이언트입니다.
import { BadRequestException } from "@nestjs/common";
import { ENV, readRequiredEnv } from "../../config/env.js";

type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LlmChatOptions = {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  /** OpenRouter 등에서 추론 토큰 비중을 제한할 때 사용합니다. */
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    exclude?: boolean;
    max_tokens?: number;
    enabled?: boolean;
  };
};

type LlmChatResult = {
  content: string;
  totalTokens: number;
};

/** Chat Completions 응답의 assistant `message.content`가 문자열 또는 멀티파트 배열일 때 텍스트만 모은다. */
export function extractAssistantMessageContent(content: unknown): string {
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (item !== null && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const typeStr = typeof o.type === "string" ? o.type : "";
        if (typeStr === "reasoning" || typeStr === "thinking") {
          continue;
        }
        if (typeof o.text === "string") {
          parts.push(o.text);
          continue;
        }
        if (typeof o.content === "string") {
          parts.push(o.content);
        }
      }
    }
    return parts.join("");
  }
  if (typeof content === "object") {
    const o = content as Record<string, unknown>;
    if (typeof o.text === "string") {
      return o.text;
    }
    if (typeof o.content === "string") {
      return o.content;
    }
  }
  return "";
}

type LlmProvider = "openrouter" | "requesty";

function resolveLlmProvider(): LlmProvider {
  const raw = ENV.llmProvider().trim().toLowerCase();
  if (raw === "openrouter") return "openrouter";
  if (raw === "requesty") return "requesty";
  throw new Error("LLM_PROVIDER는 openrouter 또는 requesty여야 합니다.");
}

function providerConfig(provider: LlmProvider): { baseUrl: string; apiKey: string } {
  if (provider === "openrouter") {
    return {
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: ENV.openRouterApiKey(),
    };
  }
  return {
    baseUrl: readRequiredEnv("REQUESTY_BASE_URL"),
    apiKey: ENV.requestyApiKey(),
  };
}

export async function requestLlmChat(options: LlmChatOptions): Promise<LlmChatResult> {
  const provider = resolveLlmProvider();
  const config = providerConfig(provider);

  const bodyPayload: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
  };
  if (options.maxTokens !== undefined) {
    bodyPayload.max_tokens = options.maxTokens;
  }
  if (provider === "openrouter" && options.reasoning !== undefined) {
    bodyPayload.reasoning = options.reasoning;
  }

  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      if (typeof errorBody?.error?.message === "string") {
        detail = errorBody.error.message;
      } else if (typeof errorBody?.message === "string") {
        detail = errorBody.message;
      }
    } catch {
      /* ignore parse error */
    }
    const suffix = detail.length > 0 ? `:${detail}` : "";
    throw new Error(`${provider}_http_${response.status}${suffix}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    usage?: { total_tokens?: number };
  };
  const rawContent = body.choices?.[0]?.message?.content;
  const content = extractAssistantMessageContent(rawContent);
  const totalTokens = typeof body.usage?.total_tokens === "number" ? body.usage.total_tokens : 0;
  if (content.length === 0) {
    const finish = body.choices?.[0]?.finish_reason;
    const hint =
      typeof finish === "string" && finish.length > 0
        ? ` (finish_reason=${finish})`
        : "";
    const lengthHint =
      finish === "length"
        ? " 출력 한도(max_tokens)에서 끊겼고 본문이 없습니다. 추론 비중을 낮추거나 max_tokens를 늘리세요."
        : "";
    throw new BadRequestException(`AI 응답이 비어 있습니다.${hint}${lengthHint}`);
  }
  return { content, totalTokens };
}
