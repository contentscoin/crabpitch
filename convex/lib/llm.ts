/**
 * 멀티 프로바이더 LLM — Claude(Anthropic) · GPT(OpenAI) · Gemini(Google).
 * 요청 생성/응답 파싱은 순수 TS로 분리해 키 없이도 테스트 가능.
 * 실호출은 aiActions.ts ("use node") 에서만 수행.
 *
 * 키는 전적으로 사용자 BYOK(userAiKeys)만 사용한다 — SaaS가 제공하는
 * 공용 LLM 키는 없다.
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
}

export const LLM_PROVIDER_META: Record<LlmProvider, LlmProviderMeta> = {
  anthropic: {
    id: "anthropic",
    label: "Claude",
    vendor: "Anthropic",
    defaultModel: "claude-opus-5",
    keyConsoleUrl: "https://platform.claude.com/settings/keys",
    keyPrefixHint: "sk-ant-",
  },
  openai: {
    id: "openai",
    label: "GPT",
    vendor: "OpenAI",
    defaultModel: "gpt-5.1",
    keyConsoleUrl: "https://platform.openai.com/api-keys",
    keyPrefixHint: "sk-",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    vendor: "Google",
    defaultModel: "gemini-2.5-pro",
    keyConsoleUrl: "https://aistudio.google.com/apikey",
    keyPrefixHint: "AIza",
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
  /**
   * 응답을 JSON 객체로 강제한다(프로바이더가 지원하는 경우에만).
   *
   * 프롬프트 문장("JSON만 출력")만으로는 모델이 머리말·코드펜스를 붙여 파싱이 깨진다.
   * 파싱이 깨지면 호출부는 조용히 원본으로 되돌아가므로, 사용자는 키를 등록하고
   * 비용을 냈는데 아무 변화가 없는 상태를 보게 된다.
   */
  jsonOutput?: boolean;
}

/**
 * ⚠️ `temperature`·`top_p`를 넣지 말 것.
 *
 * 두 프로바이더의 **기본 모델이 추론 모델**이고, 샘플링 파라미터를 기본값이 아닌 값으로
 * 보내면 400을 반환한다.
 *  - Anthropic: temperature/top_p/top_k는 Claude 4.7 이상에서 미지원 —
 *    기본값이 아닌 값을 넣으면 400. (기본 모델 `claude-opus-5`가 해당)
 *  - OpenAI: GPT-5 계열은 `reasoning_effort: "none"`일 때만 temperature를 받는다.
 *    (기본 모델 `gpt-5.1`이 해당)
 * 출력 성향은 프롬프트와 `jsonOutput`으로 통제한다.
 *
 * 출처: https://platform.claude.com/docs/en/build-with-claude/working-with-messages
 */

/**
 * JSON 모드를 지원하는 프로바이더.
 *
 * anthropic은 제외한다 — Messages API의 구조화 출력은 모델별 지원 범위가 갈리고
 * (기본 모델 `claude-opus-5`의 지원 여부가 문서에서 확인되지 않는다) 잘못된 필드를
 * 보내면 요청 전체가 실패한다. Claude는 프롬프트 + `callLlmForJson`의 재시도로 다룬다.
 */
const JSON_MODE_PROVIDERS: ReadonlySet<LlmProvider> = new Set<LlmProvider>(["openai", "gemini"]);

/**
 * OpenAI의 `json_object` 모드는 프롬프트에 "json"이라는 단어가 없으면 400을 반환한다.
 * 호출부가 프롬프트를 고치다가 단어를 지우면 전 기능이 죽으므로 여기서 방어한다.
 */
function mentionsJson(input: LlmCallInput): boolean {
  return /json/i.test(input.system) || /json/i.test(input.user);
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
  const jsonMode =
    input.jsonOutput === true && JSON_MODE_PROVIDERS.has(provider) && mentionsJson(input);

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
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
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
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          },
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
