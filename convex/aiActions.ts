"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import {
  emailEnhanceSystemPrompt,
  emailEnhanceUserPrompt,
  parseEnhanceEmailResult,
  parsePolishPressResult,
  pressPolishSystemPrompt,
  pressPolishUserPrompt,
  type PolishPressResult,
} from "./lib/anthropicEnhance";
import { lintPressRelease, type PressLintResult } from "./lib/pressLint";
import {
  mediaKitEnhanceSystemPrompt,
  mediaKitEnhanceUserPrompt,
  mediaKitGenerateSystemPrompt,
  mediaKitGenerateUserPrompt,
  parseMediaKitDraft,
  parseMediaKitGaps,
  type MediaKitDraft,
  type MediaKitGap,
} from "./lib/mediaKitEnhance";
import {
  buildLlmRequest,
  LLM_PROVIDER_META,
  parseLlmResponse,
  type LlmProvider,
} from "./lib/llm";
import { llmProviderValidator } from "./aiKeys";
// S11 회신 분류 폴백
import { classifyReply, type ReplyType } from "./lib/replyClassifier";
import {
  maskReplyForLlm,
  needsLlmFallback,
  parseReplyClassification,
  replyClassifySystemPrompt,
  replyClassifyUserPrompt,
  REPLY_TYPE_LABELS,
} from "./lib/replyLlm";

interface ResolvedLlm {
  provider: LlmProvider;
  apiKey: string;
  model: string | null;
}

/** 해석된 프로바이더로 1회 호출. 실패 시 throw. */
async function callLlm(
  resolved: ResolvedLlm,
  system: string,
  user: string,
  maxTokens?: number,
): Promise<string | null> {
  const req = buildLlmRequest(resolved.provider, resolved.apiKey, {
    model: resolved.model ?? undefined,
    system,
    user,
    maxTokens,
  });
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${LLM_PROVIDER_META[resolved.provider].label} HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const data: unknown = await res.json();
  return parseLlmResponse(resolved.provider, data);
}

async function resolveLlm(
  ctx: ActionCtx,
  userId: Id<"users">,
  provider?: LlmProvider,
): Promise<ResolvedLlm | null> {
  return await ctx.runQuery(internal.aiKeys.resolveForUser, { userId, provider });
}

function providerLabel(p: LlmProvider): string {
  return LLM_PROVIDER_META[p].label;
}

const NO_KEY_MESSAGE =
  "연결된 AI가 없습니다. 「내 AI」에서 GPT·Claude·Gemini 중 하나의 API 키를 등록하면 웹에서 바로 다듬을 수 있습니다.";

/**
 * 연결 테스트 — 등록한 키로 초소형 호출을 보내 동작을 확인한다.
 */
export const testAiConnection = action({
  args: { provider: llmProviderValidator },
  handler: async (
    ctx,
    { provider },
  ): Promise<{ ok: boolean; message: string; model?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const resolved = await resolveLlm(ctx, userId, provider);
    if (!resolved || resolved.provider !== provider) {
      return { ok: false, message: "이 프로바이더에 등록된 키가 없습니다." };
    }

    try {
      const text = await callLlm(
        resolved,
        "당신은 연결 테스트 응답기입니다. 무조건 'OK'라고만 답하세요.",
        "연결 테스트",
        1000,
      );
      const ok = typeof text === "string" && text.length > 0;
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider,
        ok,
        error: ok ? undefined : "빈 응답",
      });
      return ok
        ? {
            ok: true,
            message: `${providerLabel(provider)} 연결 성공 — 웹에서 바로 사용할 수 있습니다.`,
            model: resolved.model ?? LLM_PROVIDER_META[provider].defaultModel,
          }
        : { ok: false, message: "응답을 받지 못했습니다. 키와 모델명을 확인하세요." };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "호출 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider,
        ok: false,
        error: msg,
      });
      return { ok: false, message: `연결 실패: ${msg}` };
    }
  },
});

/**
 * 캠페인 메일 초안 AI 개인화 — 연결된 GPT·Claude·Gemini 중 기본 프로바이더로 실행.
 * 키가 하나도 없으면 mode:"skipped" (템플릿 초안 유지).
 */
export const enhanceCampaignDrafts = action({
  args: { campaignId: v.id("campaigns") },
  handler: async (
    ctx,
    { campaignId },
  ): Promise<{
    enhanced: number;
    mode: "anthropic" | "openai" | "gemini" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const resolved = await resolveLlm(ctx, userId);
    if (!resolved) {
      return { enhanced: 0, mode: "skipped", message: NO_KEY_MESSAGE };
    }

    const pack = await ctx.runQuery(internal.drafts.listDraftsForEnhance, {
      campaignId,
      userId,
    });
    if (!pack || pack.drafts.length === 0) {
      return { enhanced: 0, mode: "skipped", message: "강화할 초안이 없습니다." };
    }

    try {
      const updates: Array<{
        draftId: (typeof pack.drafts)[number]["draftId"];
        subject: string;
        body: string;
      }> = [];
      for (const d of pack.drafts) {
        const raw = await callLlm(
          resolved,
          emailEnhanceSystemPrompt(),
          emailEnhanceUserPrompt({
            subject: d.subject,
            body: d.body,
            companyName: pack.companyName,
            senderName: pack.senderName,
            headline: pack.headline,
            beatPrimary: d.beatPrimary,
            topReferenceTitle: d.topReferenceTitle,
            beatSecondary: d.beatSecondary,
            beatDistribution: d.beatDistribution,
            outletCategory: d.outletCategory as
              | "newswire"
              | "it"
              | "economy"
              | "general"
              | undefined,
            referenceArticles: d.referenceArticles,
            embargoAt: pack.embargoAt,
            hasAssets: pack.hasAssets,
          }),
        );
        if (!raw) continue;
        const next = parseEnhanceEmailResult(raw, { subject: d.subject, body: d.body });
        updates.push({ draftId: d.draftId, subject: next.subject, body: next.body });
      }

      if (updates.length === 0) {
        await ctx.runMutation(internal.aiKeys.recordUsage, {
          userId,
          provider: resolved.provider,
          ok: false,
          error: "응답 파싱 실패",
        });
        return {
          enhanced: 0,
          mode: "error",
          message: `${providerLabel(resolved.provider)} 응답을 파싱하지 못했습니다.`,
        };
      }

      const n: number = await ctx.runMutation(internal.drafts.applyEnhancedDrafts, {
        updates,
      });
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: true,
      });
      return {
        enhanced: n,
        mode: resolved.provider,
        message: `${providerLabel(resolved.provider)}로 ${n}건 메일 초안을 개인화했습니다.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 개인화 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: false,
        error: msg,
      });
      return { enhanced: 0, mode: "error", message: msg };
    }
  },
});

/**
 * 보도자료 초안 AI 다듬기 (저장 전 클라이언트에서 호출).
 * 연결된 프로바이더가 없으면 입력값을 그대로 반환.
 */
export const polishPressRelease = action({
  args: {
    title: v.string(),
    topicTags: v.array(v.string()),
    who: v.optional(v.string()),
    newsValue: v.optional(v.string()),
    numbers: v.optional(v.string()),
    quote: v.optional(v.string()),
    bodyHint: v.optional(v.string()),
    boilerplate: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    PolishPressResult & {
      mode: "anthropic" | "openai" | "gemini" | "skipped" | "error";
      message?: string;
      /** 결정적 lint 결과 — 1차는 warn-only(저장을 막지 않는다) */
      lint: PressLintResult;
    }
  > => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const fallback = {
      title: args.title,
      headlines: [args.title, `${args.title} — 수치`, `${args.title} — 업계`],
      body: args.bodyHint ?? args.newsValue ?? args.title,
    };

    const resolved = await resolveLlm(ctx, userId);
    if (!resolved) {
      // AI 미연결이어도 lint는 돌려준다 — 규칙 검사는 LLM과 무관한 결정적 코드다.
      return {
        ...fallback,
        mode: "skipped",
        message: NO_KEY_MESSAGE,
        lint: lintPressRelease(fallback.title, fallback.body),
      };
    }

    try {
      const raw = await callLlm(
        resolved,
        pressPolishSystemPrompt(),
        pressPolishUserPrompt({
          title: args.title,
          who: args.who,
          newsValue: args.newsValue,
          numbers: args.numbers,
          quote: args.quote,
          topicTags: args.topicTags,
          bodyHint: args.bodyHint,
          boilerplate: args.boilerplate,
        }),
      );
      if (!raw) {
        await ctx.runMutation(internal.aiKeys.recordUsage, {
          userId,
          provider: resolved.provider,
          ok: false,
          error: "빈 응답",
        });
        return {
          ...fallback,
          mode: "error",
          message: "빈 응답",
          lint: lintPressRelease(fallback.title, fallback.body),
        };
      }
      const polished = parsePolishPressResult(raw, fallback);
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: true,
      });
      return {
        ...polished,
        mode: resolved.provider,
        message: `${providerLabel(resolved.provider)}로 보도자료를 다듬었습니다.`,
        lint: lintPressRelease(polished.title, polished.body),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "보도자료 다듬기 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: false,
        error: msg,
      });
      return {
        ...fallback,
        mode: "error",
        message: msg,
        lint: lintPressRelease(fallback.title, fallback.body),
      };
    }
  },
});

/* ── 미디어킷 BYOK 생성·보강 (트랙 C) ────────────────────────
 * AI는 DB에 직접 쓰지 않는다 — 폼에 채워 넣고 저장은 사용자가 명시적으로 한다(승인 흐름 보존).
 */

const EMPTY_KIT: MediaKitDraft = {
  boilerplate: "",
  keyMessages: [],
  factSheet: [],
  narrative: "",
  spokesperson: "",
  quotes: [],
  contact: "",
};

const factSheetValidator = v.array(
  v.object({
    label: v.string(),
    value: v.string(),
    source: v.optional(v.string()),
  }),
);

const kitValidator = v.object({
  boilerplate: v.string(),
  keyMessages: v.array(v.string()),
  factSheet: factSheetValidator,
  narrative: v.string(),
  spokesperson: v.string(),
  quotes: v.array(v.string()),
  contact: v.string(),
  // v2 확장 4필드 — 전부 optional이라 기존 호출부는 그대로 통과한다.
  // 이 인자를 받아야 보강이 사용자가 채운 비주얼·자산 규정·최근 보도를 **읽고** 다듬을 수 있다.
  oneLiner: v.optional(v.string()),
  visuals: v.optional(
    v.array(
      v.object({
        label: v.string(),
        url: v.optional(v.string()),
        alt: v.optional(v.string()),
        caption: v.optional(v.string()),
      }),
    ),
  ),
  assetPolicy: v.optional(
    v.object({
      usageScope: v.optional(v.string()),
      modificationLimits: v.optional(v.string()),
      credit: v.optional(v.string()),
      trademarkContact: v.optional(v.string()),
    }),
  ),
  coverage: v.optional(
    v.array(
      v.object({
        outlet: v.string(),
        title: v.string(),
        url: v.optional(v.string()),
        publishedAtText: v.optional(v.string()),
      }),
    ),
  ),
});

/** 회사 정보 몇 줄 → 미디어킷 7필드 초안. */
export const generateMediaKit = action({
  args: {
    companyName: v.string(),
    industry: v.optional(v.string()),
    oneLiner: v.optional(v.string()),
    numbers: v.optional(v.string()),
    contact: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    kit: MediaKitDraft;
    mode: "anthropic" | "openai" | "gemini" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const resolved = await resolveLlm(ctx, userId);
    if (!resolved) return { kit: EMPTY_KIT, mode: "skipped", message: NO_KEY_MESSAGE };

    try {
      const raw = await callLlm(
        resolved,
        mediaKitGenerateSystemPrompt(),
        mediaKitGenerateUserPrompt(args),
      );
      if (!raw) {
        await ctx.runMutation(internal.aiKeys.recordUsage, {
          userId,
          provider: resolved.provider,
          ok: false,
          error: "빈 응답",
        });
        return { kit: EMPTY_KIT, mode: "error", message: "빈 응답" };
      }
      const kit = parseMediaKitDraft(raw, {
        ...EMPTY_KIT,
        contact: args.contact ?? "",
      });
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: kit !== null,
        error: kit ? undefined : "응답 파싱 실패",
      });
      if (!kit) {
        return {
          kit: EMPTY_KIT,
          mode: "error",
          message: `${providerLabel(resolved.provider)} 응답을 파싱하지 못했습니다.`,
        };
      }
      return {
        kit,
        mode: resolved.provider,
        message: `${providerLabel(resolved.provider)}로 초안을 만들었습니다. 확인 후 저장하세요.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "미디어킷 생성 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: false,
        error: msg,
      });
      return { kit: EMPTY_KIT, mode: "error", message: msg };
    }
  },
});

/** 현재 킷 → 개선안 + 갭 리포트. */
export const enhanceMediaKit = action({
  args: {
    companyName: v.string(),
    kit: kitValidator,
  },
  handler: async (
    ctx,
    { companyName, kit },
  ): Promise<{
    kit: MediaKitDraft;
    gaps: MediaKitGap[];
    mode: "anthropic" | "openai" | "gemini" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const resolved = await resolveLlm(ctx, userId);
    if (!resolved) return { kit, gaps: [], mode: "skipped", message: NO_KEY_MESSAGE };

    try {
      const raw = await callLlm(
        resolved,
        mediaKitEnhanceSystemPrompt(),
        mediaKitEnhanceUserPrompt({ companyName, ...kit }),
      );
      if (!raw) {
        await ctx.runMutation(internal.aiKeys.recordUsage, {
          userId,
          provider: resolved.provider,
          ok: false,
          error: "빈 응답",
        });
        return { kit, gaps: [], mode: "error", message: "빈 응답" };
      }
      const improved = parseMediaKitDraft(raw, kit) ?? kit;
      const gaps = parseMediaKitGaps(raw);
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: true,
      });
      return {
        kit: improved,
        gaps,
        mode: resolved.provider,
        message: `${providerLabel(resolved.provider)}로 보강안을 만들었습니다. 확인 후 저장하세요.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "미디어킷 보강 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: false,
        error: msg,
      });
      return { kit, gaps: [], mode: "error", message: msg };
    }
  },
});

/* ── 기자 회신 분류 BYOK 폴백 (S11) ──────────────────────────
 * 키워드 규칙이 아무 신호도 못 잡은 회신만 사용자 LLM으로 보조 분류한다.
 * 이 액션은 "제안"까지만 만든다 — 최종 판정과 억제 리스트 등록은
 * `replies.applyAiClassification`이 원문으로 다시 수행한다(컴플라이언스 단일 강제 지점).
 */
export const classifyReplyWithAi = action({
  args: { replyId: v.id("replies") },
  handler: async (
    ctx,
    { replyId },
  ): Promise<{
    type: ReplyType;
    source: "rule" | "llm";
    changed: boolean;
    suppressed: boolean;
    mode: "anthropic" | "openai" | "gemini" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const reply = await ctx.runQuery(internal.replies.getForAiClassify, { replyId, userId });
    if (!reply) throw new Error("회신을 찾을 수 없습니다.");

    const unchanged = {
      type: reply.type,
      source: "rule" as const,
      changed: false,
      suppressed: false,
    };
    if (reply.locked) {
      return { ...unchanged, mode: "skipped", message: "이미 처리된 회신입니다." };
    }

    // 규칙이 신호를 잡았으면 호출 자체를 하지 않는다 — 결정적 동작 보존 + 회신당 비용 절약.
    const rule = classifyReply(reply.rawBody);
    if (!needsLlmFallback(rule)) {
      return {
        ...unchanged,
        type: rule.type,
        mode: "skipped",
        message: `규칙이 '${rule.matched}' 신호로 분류했습니다 — AI 보조가 필요 없습니다.`,
      };
    }

    // 크랩피치는 공용 LLM 키를 두지 않는다 — 키가 없으면 규칙 결과(확인 질문)를 그대로 쓴다.
    const resolved = await resolveLlm(ctx, userId);
    if (!resolved) {
      return { ...unchanged, type: rule.type, mode: "skipped", message: NO_KEY_MESSAGE };
    }

    try {
      const raw = await callLlm(
        resolved,
        replyClassifySystemPrompt(),
        // PII 마스킹: 회신 원문에 섞인 기자 이메일·전화는 외부 제공자로 나가지 않는다.
        replyClassifyUserPrompt(maskReplyForLlm(reply.rawBody)),
      );
      const proposal = raw ? parseReplyClassification(raw) : null;
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: proposal !== null,
        error: proposal ? undefined : raw ? "7유형 밖 응답 또는 파싱 실패" : "빈 응답",
      });
      if (!proposal) {
        return {
          ...unchanged,
          type: rule.type,
          mode: "error",
          message: `${providerLabel(resolved.provider)} 응답을 쓸 수 없어 규칙 분류를 유지합니다.`,
        };
      }

      const applied = await ctx.runMutation(internal.replies.applyAiClassification, {
        replyId,
        userId,
        proposal: {
          type: proposal.type,
          ...(proposal.questionSubtype ? { questionSubtype: proposal.questionSubtype } : {}),
        },
      });
      const suppressNote = applied.suppressed ? " 수신거부로 판정해 억제 리스트에 등록했습니다." : "";
      return {
        ...applied,
        mode: resolved.provider,
        message: applied.changed
          ? `${providerLabel(resolved.provider)}가 '${REPLY_TYPE_LABELS[applied.type]}'으로 다시 분류했습니다.${suppressNote}`
          : `${providerLabel(resolved.provider)}도 기존 분류를 유지했습니다.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "회신 분류 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: false,
        error: msg,
      });
      return { ...unchanged, type: rule.type, mode: "error", message: msg };
    }
  },
});
