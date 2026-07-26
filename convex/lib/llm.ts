/**
 * 멀티 프로바이더 LLM — Claude(Anthropic) · GPT(OpenAI) · Gemini(Google).
 * 요청 생성/응답 파싱은 순수 TS로 분리해 키 없이도 테스트 가능.
 * 실호출은 aiActions.ts ("use node") 에서만 수행.
 *
 * 키 해석 우선순위: 사용자 BYOK 키(userAiKeys) → 서버 환경변수
 * (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY).
 */

export type LlmProvider = "anthropic" | "openai" | "gemini";

export const LLM_PROVIDERS: LlmProvider[] = ["anthropic", "openai", "gemini"];

export interface LlmProviderMeta {
  id: LlmProvider;
  /** UI 표시명 (사용자에게 익숙한 제품명) */
  label: string;
  vendor: string;
  defaultModel: string;
  /** 키 발급 콘솔 */
  keyConsoleUrl: string;
  /** 키 접두(느슨한 힌트 — 차단용 아님) */
  keyPrefixHint: string;
  envVar: string;
}

export const LLM_PROVIDER_META: Record<LlmProvider, LlmProviderMeta> = {
  anthropic: {
    id: "anthropic",
    label: "Claude",
    vendor: "Anthropic",
    defaultModel: "claude-opus-5",
    keyConsoleUrl: "https://platform.claude.com/settings/keys",
    keyPrefixHint: "sk-ant-",
    envVar: "ANTHROPIC_API_KEY",
  },
  openai: {
    id: "openai",
    label: "GPT",
    vendor: "OpenAI",
    defaultModel: "gpt-5.1",
    keyConsoleUrl: "https://platform.openai.com/api-keys",
    keyPrefixHint: "sk-",
    envVar: "OPENAI_API_KEY",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    vendor: "Google",
    defaultModel: "gemini-2.5-pro",
    keyConsoleUrl: "https://aistudio.google.com/apikey",
    keyPrefixHint: "AIza",
    envVar: "GEMINI_API_KEY",
  },
};

export function isLlmProvider(v: string): v is LlmProvider {
  return v === "anthropic" || v === "openai" || v === "gemini";
}

/** UI 표시용 키 마스킹: 앞 6자 + … + 뒤 4자. 원문은 클라이언트로 절대 반환 금지. */
export function maskApiKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return `${k.slice(0, 2)}…`;
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/** 형식 힌트(경고용). 저장 자체는 막지 않는다 — 프로바이더별 키 형식은 수시로 바뀜. */
export function looksLikeProviderKey(provider: LlmProvider, key: string): boolean {
  return key.trim().startsWith(LLM_PROVIDER_META[provider].keyPrefixHint);
}

export interface LlmCallInput {
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LlmHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 프로바이더별 HTTP 요청 생성. 키는 헤더로만 전달(URL 금지 — 로그 유출 방지). */
export function buildLlmRequest(
  provider: LlmProvider,
  apiKey: string,
  input: LlmCallInput,
): LlmHttpRequest {
  const model = input.model?.trim() || LLM_PROVIDER_META[provider].defaultModel;
  // Claude Opus 5는 thinking이 기본 활성 — max_tokens가 thinking+본문 합산 상한이라 여유를 둔다.
  const maxTokens = input.maxTokens ?? 4000;

  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: input.system,
          messages: [{ role: "user", content: input.user }],
        }),
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
      };
    case "gemini":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      };
  }
}

/** 프로바이더별 응답에서 본문 텍스트 추출. 실패 시 null. */
export function parseLlmResponse(provider: LlmProvider, data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  switch (provider) {
    case "anthropic": {
      const content = d.content;
      if (!Array.isArray(content)) return null;
      const texts = content
        .filter(
          (c): c is { type: string; text: string } =>
            !!c && typeof c === "object" && (c as { type?: unknown }).type === "text" &&
            typeof (c as { text?: unknown }).text === "string",
        )
        .map((c) => c.text);
      return texts.length ? texts.join("\n") : null;
    }
    case "openai": {
      const choices = d.choices;
      if (!Array.isArray(choices) || !choices[0]) return null;
      const msg = (choices[0] as { message?: { content?: unknown } }).message;
      return typeof msg?.content === "string" && msg.content ? msg.content : null;
    }
    case "gemini": {
      const candidates = d.candidates;
      if (!Array.isArray(candidates) || !candidates[0]) return null;
      const parts = (candidates[0] as { content?: { parts?: unknown } }).content?.parts;
      if (!Array.isArray(parts)) return null;
      const texts = parts
        .filter(
          (p): p is { text: string } =>
            !!p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string",
        )
        .map((p) => p.text);
      return texts.length ? texts.join("") : null;
    }
  }
}

/**
 * 사용할 프로바이더 결정.
 * preferred가 사용 가능하면 그것, 아니면 available 순서(anthropic→openai→gemini)에서 첫 번째.
 */
export function pickProvider(
  preferred: string | null | undefined,
  available: LlmProvider[],
): LlmProvider | null {
  if (preferred && isLlmProvider(preferred) && available.includes(preferred)) {
    return preferred;
  }
  for (const p of LLM_PROVIDERS) {
    if (available.includes(p)) return p;
  }
  return null;
}
