"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  emailEnhanceSystemPrompt,
  emailEnhanceUserPrompt,
  parseEnhanceEmailResult,
  parsePolishPressResult,
  pressPolishSystemPrompt,
  pressPolishUserPrompt,
} from "./lib/anthropicEnhance";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

async function callAnthropic(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text;
  return text ?? null;
}

/**
 * 캠페인 메일 초안 AI 개인화.
 * ANTHROPIC_API_KEY 없으면 mode:"skipped" (템플릿 초안 유지).
 */
export const enhanceCampaignDrafts = action({
  args: { campaignId: v.id("campaigns") },
  handler: async (
    ctx,
    { campaignId },
  ): Promise<{
    enhanced: number;
    mode: "anthropic" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return {
        enhanced: 0,
        mode: "skipped",
        message: "ANTHROPIC_API_KEY 미설정 — 템플릿 초안을 그대로 사용합니다.",
      };
    }

    const pack = await ctx.runQuery(internal.drafts.listDraftsForEnhance, {
      campaignId,
      userId,
    });
    if (!pack || pack.drafts.length === 0) {
      return { enhanced: 0, mode: "skipped", message: "강화할 초안이 없습니다." };
    }

    try {
      const updates: Array<{ draftId: (typeof pack.drafts)[number]["draftId"]; subject: string; body: string }> =
        [];
      for (const d of pack.drafts) {
        const raw = await callAnthropic(
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
        return {
          enhanced: 0,
          mode: "error",
          message: "Anthropic 응답을 파싱하지 못했습니다.",
        };
      }

      const n: number = await ctx.runMutation(internal.drafts.applyEnhancedDrafts, { updates });
      return {
        enhanced: n,
        mode: "anthropic",
        message: `AI로 ${n}건 메일 초안을 개인화했습니다.`,
      };
    } catch (e) {
      return {
        enhanced: 0,
        mode: "error",
        message: e instanceof Error ? e.message : "AI 개인화 실패",
      };
    }
  },
});

/**
 * 보도자료 초안 AI 다듬기 (저장 전 클라이언트에서 호출).
 * 키 없으면 입력값을 그대로 반환.
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
    mode: "anthropic" | "skipped" | "error";
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");

    const fallback = {
      title: args.title,
      headlines: [args.title, `${args.title} — 수치`, `${args.title} — 업계`],
      body: args.bodyHint ?? args.newsValue ?? args.title,
    };

    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return {
        ...fallback,
        mode: "skipped",
        message: "ANTHROPIC_API_KEY 미설정 — 입력값을 그대로 사용합니다.",
      };
    }

    try {
      const raw = await callAnthropic(
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
        return { ...fallback, mode: "error", message: "빈 응답" };
      }
      const polished = parsePolishPressResult(raw, fallback);
      return {
        ...polished,
        mode: "anthropic",
        message: "보도자료를 AI로 다듬었습니다.",
      };
    } catch (e) {
      return {
        ...fallback,
        mode: "error",
        message: e instanceof Error ? e.message : "보도자료 다듬기 실패",
      };
    }
  },
});
