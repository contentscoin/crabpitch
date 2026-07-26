import { describe, expect, it } from "vitest";
import {
  buildLlmRequest,
  isLlmProvider,
  LLM_PROVIDER_META,
  LLM_PROVIDERS,
  looksLikeProviderKey,
  maskApiKey,
  parseLlmResponse,
  pickProvider,
} from "./llm";

describe("llm 프로바이더 메타", () => {
  it("세 프로바이더를 정의한다", () => {
    expect(LLM_PROVIDERS).toEqual(["anthropic", "openai", "gemini"]);
    for (const p of LLM_PROVIDERS) {
      expect(LLM_PROVIDER_META[p].defaultModel).toBeTruthy();
      expect(LLM_PROVIDER_META[p].envVar).toContain("API_KEY");
    }
  });

  it("provider id 가드", () => {
    expect(isLlmProvider("anthropic")).toBe(true);
    expect(isLlmProvider("openai")).toBe(true);
    expect(isLlmProvider("gemini")).toBe(true);
    expect(isLlmProvider("claude")).toBe(false);
  });
});

describe("buildLlmRequest", () => {
  const input = { system: "시스템", user: "유저", maxTokens: 1000 };

  it("anthropic: x-api-key 헤더 + messages 형식", () => {
    const req = buildLlmRequest("anthropic", "sk-ant-test", input);
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-ant-test");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(req.body);
    expect(body.model).toBe(LLM_PROVIDER_META.anthropic.defaultModel);
    expect(body.system).toBe("시스템");
    expect(body.messages).toEqual([{ role: "user", content: "유저" }]);
    expect(body.max_tokens).toBe(1000);
  });

  it("openai: Bearer 헤더 + system/user 메시지 + max_completion_tokens", () => {
    const req = buildLlmRequest("openai", "sk-test", input);
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(req.body);
    expect(body.max_completion_tokens).toBe(1000);
    expect(body.messages[0]).toEqual({ role: "system", content: "시스템" });
    expect(body.messages[1]).toEqual({ role: "user", content: "유저" });
  });

  it("gemini: 키는 헤더로만, URL에 노출하지 않는다", () => {
    const req = buildLlmRequest("gemini", "AIza-test", input);
    expect(req.url).not.toContain("AIza-test");
    expect(req.headers["x-goog-api-key"]).toBe("AIza-test");
    const body = JSON.parse(req.body);
    expect(body.systemInstruction.parts[0].text).toBe("시스템");
    expect(body.contents[0].parts[0].text).toBe("유저");
    expect(body.generationConfig.maxOutputTokens).toBe(1000);
  });

  it("모델 오버라이드를 적용한다", () => {
    const req = buildLlmRequest("anthropic", "k", { ...input, model: "claude-sonnet-5" });
    expect(JSON.parse(req.body).model).toBe("claude-sonnet-5");
  });
});

describe("parseLlmResponse", () => {
  it("anthropic content[].text", () => {
    expect(
      parseLlmResponse("anthropic", { content: [{ type: "text", text: "안녕" }] }),
    ).toBe("안녕");
    expect(
      parseLlmResponse("anthropic", {
        content: [{ type: "thinking", thinking: "" }, { type: "text", text: "본문" }],
      }),
    ).toBe("본문");
  });

  it("openai choices[0].message.content", () => {
    expect(
      parseLlmResponse("openai", { choices: [{ message: { content: "응답" } }] }),
    ).toBe("응답");
  });

  it("gemini candidates[0].content.parts[].text", () => {
    expect(
      parseLlmResponse("gemini", {
        candidates: [{ content: { parts: [{ text: "제" }, { text: "미" }] } }],
      }),
    ).toBe("제미");
  });

  it("형식이 다르면 null", () => {
    expect(parseLlmResponse("anthropic", {})).toBeNull();
    expect(parseLlmResponse("openai", { choices: [] })).toBeNull();
    expect(parseLlmResponse("gemini", null)).toBeNull();
  });
});

describe("maskApiKey / looksLikeProviderKey", () => {
  it("앞뒤만 남기고 마스킹한다", () => {
    expect(maskApiKey("sk-ant-api03-abcdefghijklmn")).toBe("sk-ant…klmn");
    expect(maskApiKey("short")).toBe("sh…");
  });

  it("프로바이더 키 형식 힌트", () => {
    expect(looksLikeProviderKey("anthropic", "sk-ant-xxx")).toBe(true);
    expect(looksLikeProviderKey("anthropic", "sk-xxx")).toBe(false);
    expect(looksLikeProviderKey("gemini", "AIzaXXX")).toBe(true);
  });
});

describe("pickProvider", () => {
  it("선호 프로바이더가 사용 가능하면 우선한다", () => {
    expect(pickProvider("gemini", ["anthropic", "gemini"])).toBe("gemini");
  });

  it("선호가 불가하면 anthropic→openai→gemini 순서", () => {
    expect(pickProvider("gemini", ["openai", "anthropic"])).toBe("anthropic");
    expect(pickProvider(null, ["gemini", "openai"])).toBe("openai");
    expect(pickProvider(undefined, [])).toBeNull();
  });
});
