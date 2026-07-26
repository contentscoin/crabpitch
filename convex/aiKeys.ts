import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getProfile, requireUser } from "./model";
import {
  isLlmProvider,
  LLM_PROVIDER_META,
  LLM_PROVIDERS,
  looksLikeProviderKey,
  maskApiKey,
  pickProvider,
  type LlmProvider,
} from "./lib/llm";

export const llmProviderValidator = v.union(
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("gemini"),
);

function serverEnvKey(provider: LlmProvider): string | null {
  const key = process.env[LLM_PROVIDER_META[provider].envVar]?.trim();
  return key || null;
}

/**
 * 내 AI 키 현황 — 원문 키는 절대 반환하지 않는다(마스킹만).
 * 서버 환경변수 키 보유 여부도 함께 알려 "웹에서 바로 쓰기" 가능 여부를 판단한다.
 */
export const status = query({
  args: {},
  returns: v.object({
    preferredProvider: v.union(llmProviderValidator, v.null()),
    activeProvider: v.union(llmProviderValidator, v.null()),
    providers: v.array(
      v.object({
        provider: llmProviderValidator,
        label: v.string(),
        vendor: v.string(),
        defaultModel: v.string(),
        keyConsoleUrl: v.string(),
        keyPrefixHint: v.string(),
        hasUserKey: v.boolean(),
        maskedKey: v.union(v.string(), v.null()),
        model: v.union(v.string(), v.null()),
        serverKeyAvailable: v.boolean(),
        lastUsedAt: v.union(v.number(), v.null()),
        lastStatus: v.union(v.literal("ok"), v.literal("error"), v.null()),
        lastError: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    const rows = await ctx.db
      .query("userAiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const available: LlmProvider[] = [];
    const providers = LLM_PROVIDERS.map((p) => {
      const meta = LLM_PROVIDER_META[p];
      const row = rows.find((r) => r.provider === p);
      const serverKeyAvailable = serverEnvKey(p) !== null;
      if (row || serverKeyAvailable) available.push(p);
      return {
        provider: p,
        label: meta.label,
        vendor: meta.vendor,
        defaultModel: meta.defaultModel,
        keyConsoleUrl: meta.keyConsoleUrl,
        keyPrefixHint: meta.keyPrefixHint,
        hasUserKey: !!row,
        maskedKey: row ? maskApiKey(row.apiKey) : null,
        model: row?.model ?? null,
        serverKeyAvailable,
        lastUsedAt: row?.lastUsedAt ?? null,
        lastStatus: row?.lastStatus ?? null,
        lastError: row?.lastError ?? null,
      };
    });

    const preferred = profile?.preferredLlmProvider ?? null;
    return {
      preferredProvider: preferred,
      activeProvider: pickProvider(preferred, available),
      providers,
    };
  },
});

/** 키 저장(업서트). 형식이 어긋나면 저장은 하되 경고 문구를 돌려준다. */
export const save = mutation({
  args: {
    provider: llmProviderValidator,
    apiKey: v.string(),
    model: v.optional(v.string()),
  },
  returns: v.object({ warning: v.union(v.string(), v.null()) }),
  handler: async (ctx, { provider, apiKey, model }) => {
    const userId = await requireUser(ctx);
    const key = apiKey.trim();
    if (!key) throw new Error("API 키를 입력하세요.");
    if (key.length < 12) throw new Error("API 키가 너무 짧습니다. 콘솔에서 발급한 키 전체를 붙여넣으세요.");

    const existing = await ctx.db
      .query("userAiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider),
      )
      .unique();

    const doc = {
      userId,
      provider,
      apiKey: key,
      model: model?.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
      lastUsedAt: undefined,
      lastStatus: undefined,
      lastError: undefined,
    };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("userAiKeys", doc);
    }

    const meta = LLM_PROVIDER_META[provider];
    return {
      warning: looksLikeProviderKey(provider, key)
        ? null
        : `${meta.vendor} 키는 보통 「${meta.keyPrefixHint}…」로 시작합니다. 키가 맞는지 「연결 테스트」로 확인하세요.`,
    };
  },
});

export const remove = mutation({
  args: { provider: llmProviderValidator },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("userAiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const setPreferredProvider = mutation({
  args: { provider: llmProviderValidator },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("프로필이 없습니다.");
    await ctx.db.patch(profile._id, { preferredLlmProvider: provider });
    return null;
  },
});

/**
 * 액션 전용: 실행할 프로바이더 + 원문 키 해석.
 * 사용자 키 우선, 없으면 서버 환경변수 폴백. 클라이언트로 노출 금지.
 */
export const resolveForUser = internalQuery({
  args: {
    userId: v.id("users"),
    provider: v.optional(llmProviderValidator),
  },
  returns: v.union(
    v.object({
      provider: llmProviderValidator,
      apiKey: v.string(),
      model: v.union(v.string(), v.null()),
      source: v.union(v.literal("user"), v.literal("server")),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId, provider }) => {
    const rows = await ctx.db
      .query("userAiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const profile = await getProfile(ctx, userId);

    const available: LlmProvider[] = LLM_PROVIDERS.filter(
      (p) => rows.some((r) => r.provider === p) || serverEnvKey(p) !== null,
    );
    const requested = provider ?? profile?.preferredLlmProvider;
    const picked = pickProvider(
      requested && isLlmProvider(requested) ? requested : null,
      available,
    );
    if (!picked) return null;

    const row = rows.find((r) => r.provider === picked);
    if (row) {
      return {
        provider: picked,
        apiKey: row.apiKey,
        model: row.model ?? null,
        source: "user" as const,
      };
    }
    const env = serverEnvKey(picked);
    if (!env) return null;
    return { provider: picked, apiKey: env, model: null, source: "server" as const };
  },
});

/** 액션 전용: 호출 결과 기록(연결 테스트·실사용 공용). */
export const recordUsage = internalMutation({
  args: {
    userId: v.id("users"),
    provider: llmProviderValidator,
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, provider, ok, error }) => {
    const row = await ctx.db
      .query("userAiKeys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider),
      )
      .unique();
    if (!row) return null; // 서버 env 키 사용 시에는 기록할 행이 없음
    await ctx.db.patch(row._id, {
      lastUsedAt: Date.now(),
      lastStatus: ok ? "ok" : "error",
      lastError: ok ? undefined : error?.slice(0, 300),
    });
    return null;
  },
});
