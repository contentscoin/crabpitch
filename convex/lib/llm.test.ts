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
      expect(LLM_PROVIDER_META[p].keyConsoleUrl).toMatch(/^https:/);
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

  /**
   * 샘플링 파라미터는 **절대** 실려서는 안 된다.
   * 기본 모델이 둘 다 추론 모델이라 기본값이 아닌 temperature를 보내면 HTTP 400이 된다.
   *  - Anthropic: temperature/top_p/top_k는 Claude 4.7 이상 미지원
   *  - OpenAI: GPT-5 계열은 reasoning_effort="none"일 때만 허용
   */
  it("temperature·top_p를 절대 보내지 않는다(추론 모델은 400을 반환한다)", () => {
    for (const p of LLM_PROVIDERS) {
      const body = JSON.parse(buildLlmRequest(p, "k", { ...input, jsonOutput: true }).body);
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
      expect(body.generationConfig?.temperature).toBeUndefined();
    }
  });
});

describe("buildLlmRequest — JSON 출력 강제", () => {
  const jsonInput = { system: "JSON만 출력하라", user: "입력", maxTokens: 500 };

  it("openai: response_format json_object", () => {
    const body = JSON.parse(
      buildLlmRequest("openai", "k", { ...jsonInput, jsonOutput: true }).body,
    );
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("gemini: responseMimeType application/json", () => {
    const body = JSON.parse(
      buildLlmRequest("gemini", "k", { ...jsonInput, jsonOutput: true }).body,
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("anthropic: 필드를 넣지 않는다 — 기본 모델의 구조화 출력 지원이 확인되지 않았다", () => {
    const body = JSON.parse(
      buildLlmRequest("anthropic", "k", { ...jsonInput, jsonOutput: true }).body,
    );
    expect(body.response_format).toBeUndefined();
    expect(body.output_format).toBeUndefined();
  });

  it("jsonOutput을 주지 않으면 아무 필드도 붙지 않는다", () => {
    expect(JSON.parse(buildLlmRequest("openai", "k", jsonInput).body).response_format).toBeUndefined();
    expect(
      JSON.parse(buildLlmRequest("gemini", "k", jsonInput).body).generationConfig.responseMimeType,
    ).toBeUndefined();
  });

  /**
   * OpenAI의 json_object 모드는 프롬프트에 "json"이라는 단어가 없으면 400을 반환한다.
   * 프롬프트를 고치다 단어가 사라져도 전 기능이 죽지 않아야 한다.
   */
  it("프롬프트에 'json'이 없으면 강제하지 않는다(400 방어)", () => {
    const noJson = { system: "OK만 답하라", user: "연결 테스트", jsonOutput: true };
    expect(JSON.parse(buildLlmRequest("openai", "k", noJson).body).response_format).toBeUndefined();
    expect(
      JSON.parse(buildLlmRequest("gemini", "k", noJson).body).generationConfig.responseMimeType,
    ).toBeUndefined();
  });

  it("대소문자·user 프롬프트 쪽 언급도 인정한다", () => {
    const inUser = { system: "지시", user: "Json 객체로 답하라", jsonOutput: true };
    expect(JSON.parse(buildLlmRequest("openai", "k", inUser).body).response_format).toEqual({
      type: "json_object",
    });
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
