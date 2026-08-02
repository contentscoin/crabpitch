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
import { importMasterKey, openSecret, sealSecret } from "./lib/secretBox";

/**
 * API 키 봉인에 쓸 마스터 키.
 *
 * SMTP 비밀번호와 **같은 환경변수**를 쓴다(`smtpAccounts.ts`·`smtpActions.ts`와 동일).
 * 다른 이름의 별칭을 추가하면 안 된다 — 한쪽만 새 이름을 읽는 순간 "둘 중 아무거나
 * 설정하면 된다"고 믿은 배포에서 다른 쪽이 조용히 전부 실패한다. 이름을 바꾸려면
 * 세 파일을 **동시에** 바꿔야 하고, `aiPipeline.guard.test.ts`가 그것을 강제한다.
 */
async function masterKey() {
  return importMasterKey(process.env.SMTP_ENCRYPTION_KEY ?? "");
}

export const llmProviderValidator = v.union(
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("gemini"),
);

/**
 * 내 AI 키 현황 — 원문 키는 절대 반환하지 않는다(마스킹만).
 * SaaS 공용 LLM 키는 없다 — 오직 사용자 본인 키(BYOK)만 사용한다.
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
      if (row) available.push(p);
      return {
        provider: p,
        label: meta.label,
        vendor: meta.vendor,
        defaultModel: meta.defaultModel,
        keyConsoleUrl: meta.keyConsoleUrl,
        keyPrefixHint: meta.keyPrefixHint,
        hasUserKey: !!row,
        // 봉인된 키는 복호화하지 않는다 — 저장 시 만들어 둔 마스킹을 쓴다.
        // 레거시 평문 행만 즉석 마스킹으로 폴백한다.
        maskedKey: row ? (row.keyMasked ?? (row.apiKey ? maskApiKey(row.apiKey) : null)) : null,
        model: row?.model ?? null,
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

    // 봉인에 실패하면 저장하지 않는다 — 평문으로 흘려보내지 않는다.
    // (마스터 키 미설정이면 importMasterKey가 설정 방법을 담은 오류를 던진다.)
    const sealed = await sealSecret(key, await masterKey());

    const doc = {
      userId,
      provider,
      // 레거시 평문 컬럼은 비워 둔다 — 재저장이 곧 마이그레이션이다.
      apiKey: undefined,
      apiKeySealed: sealed,
      keyMasked: maskApiKey(key),
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
 * 사용자 본인 키(BYOK)만 사용한다 — 서버 공용 키 폴백 없음. 클라이언트로 노출 금지.
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
    }),
    v.null(),
  ),
  handler: async (ctx, { userId, provider }) => {
    const rows = await ctx.db
      .query("userAiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const profile = await getProfile(ctx, userId);

    const available: LlmProvider[] = LLM_PROVIDERS.filter((p) =>
      rows.some((r) => r.provider === p),
    );
    const requested = provider ?? profile?.preferredLlmProvider;
    const picked = pickProvider(
      requested && isLlmProvider(requested) ? requested : null,
      available,
    );
    if (!picked) return null;

    const row = rows.find((r) => r.provider === picked);
    if (!row) return null;

    // 봉인 컬럼이 정본. 레거시 평문 행은 사용자가 키를 다시 저장할 때까지 그대로 쓴다.
    let apiKey: string;
    if (row.apiKeySealed) {
      try {
        apiKey = await openSecret(row.apiKeySealed, await masterKey());
      } catch {
        // openSecret의 문구는 SMTP 계정용이다. 여기서는 무엇을 다시 해야 하는지 바꿔 말한다.
        // (마스터 키 교체·DB 손상 — 어느 쪽이든 재입력이 답이다.)
        throw new Error(
          "저장된 AI API 키를 복호화하지 못했습니다. 「내 AI」에서 키를 다시 등록해 주세요.",
        );
      }
    } else if (row.apiKey) {
      apiKey = row.apiKey;
    } else {
      return null;
    }
    return { provider: picked, apiKey, model: row.model ?? null };
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
    if (!row) return null;
    await ctx.db.patch(row._id, {
      lastUsedAt: Date.now(),
      lastStatus: ok ? "ok" : "error",
      lastError: ok ? undefined : error?.slice(0, 300),
    });
    return null;
  },
});
