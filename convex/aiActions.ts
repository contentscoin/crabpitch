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
} from "./lib/anthropicEnhance";
import {
  buildLlmRequest,
  LLM_PROVIDER_META,
  parseLlmResponse,
  type LlmProvider,
} from "./lib/llm";
import { llmProviderValidator } from "./aiKeys";

interface ResolvedLlm {
  provider: LlmProvider;
  apiKey: string;
  model: string | null;
  source: "user" | "server";
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
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    title: string;
    headlines: string[];
    body: string;
    mode: "anthropic" | "openai" | "gemini" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const fallback = {
      title: args.title,
      headlines: [args.title, `${args.title} — 수치`, `${args.title} — 업계`],
      body: args.bodyHint ?? args.newsValue ?? args.title,
    };

    const resolved = await resolveLlm(ctx, userId);
    if (!resolved) {
      return { ...fallback, mode: "skipped", message: NO_KEY_MESSAGE };
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
        }),
      );
      if (!raw) {
        await ctx.runMutation(internal.aiKeys.recordUsage, {
          userId,
          provider: resolved.provider,
          ok: false,
          error: "빈 응답",
        });
        return { ...fallback, mode: "error", message: "빈 응답" };
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
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "보도자료 다듬기 실패";
      await ctx.runMutation(internal.aiKeys.recordUsage, {
        userId,
        provider: resolved.provider,
        ok: false,
        error: msg,
      });
      return { ...fallback, mode: "error", message: msg };
    }
  },
});
