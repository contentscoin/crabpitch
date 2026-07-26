import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model";
import {
  classifyReply,
  buildReplyDraft,
  buildReplyDraftVariant,
  REPLY_TEMPLATE_VARIANTS,
  type QuestionSubtype,
  type ReplyType,
} from "./lib/replyClassifier";
import { journalistCode } from "./lib/mask";
import { defaultInterviewSlots, formatInterviewConfirmDraft } from "./lib/interviewSlots";

/** 기자 회신 입력 → 7유형 분류 + 답장 초안 생성. 수신거부는 즉시 억제 리스트 반영. */
export const add = mutation({
  args: {
    campaignId: v.id("campaigns"),
    journalistId: v.id("journalists"),
    rawBody: v.string(),
  },
  handler: async (ctx, { campaignId, journalistId, rawBody }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const j = await ctx.db.get(journalistId);
    if (!j) throw new Error("기자를 찾을 수 없습니다.");

    const { type, questionSubtype, needsEscalation } = classifyReply(rawBody);
    const interviewSlots = type === "interview" ? [...defaultInterviewSlots()] : undefined;
    // 자료 요청 응대는 "약속한 자료만" 안내한다 — 보도자료에 실제로 걸어둔 링크만 넘긴다.
    const pr = await ctx.db.get(campaign.pressReleaseId);
    const draftResponse = buildReplyDraft(type, {
      ...(interviewSlots
        ? { slots: [interviewSlots[0]!, interviewSlots[1]!, interviewSlots[2]!] as [string, string, string] }
        : {}),
      ...(pr?.links?.length ? { links: pr.links } : {}),
      ...(questionSubtype ? { questionSubtype } : {}),
    });

    const id = await ctx.db.insert("replies", {
      campaignId,
      journalistId,
      type,
      rawBody,
      draftResponse,
      templateVariant: "default",
      handled: false,
      ...(interviewSlots ? { interviewSlots } : {}),
      ...(questionSubtype ? { questionSubtype } : {}),
      ...(needsEscalation ? { needsEscalation } : {}),
    });

    if (type === "unsubscribe") {
      const existing = await ctx.db
        .query("suppressionList")
        .withIndex("by_user_email", (q) => q.eq("userId", userId).eq("email", j.email))
        .unique();
      if (!existing) {
        await ctx.db.insert("suppressionList", {
          userId,
          email: j.email,
          reason: "기자 회신 수신거부",
        });
      }
    }

    if (type === "published") {
      const draft = await ctx.db
        .query("emailDrafts")
        .withIndex("by_campaign_journalist", (q) =>
          q.eq("campaignId", campaignId).eq("journalistId", journalistId),
        )
        .unique();
      if (draft) await ctx.db.patch(draft._id, { status: "published" });
    }

    return { id, type };
  },
});

export const listByCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return [];
    const replies = await ctx.db
      .query("replies")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .collect();
    return Promise.all(
      replies.map(async (r) => {
        const j = await ctx.db.get(r.journalistId);
        return { ...r, code: journalistCode(r.journalistId), outlet: j?.outlet ?? "?" };
      }),
    );
  },
});

export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const nameById = new Map(campaigns.map((c) => [c._id, c.name] as const));
    const groups = await Promise.all(
      campaigns.map(async (c) => {
        const replies = await ctx.db
          .query("replies")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        return Promise.all(
          replies.map(async (r) => {
            const j = await ctx.db.get(r.journalistId);
            return {
              ...r,
              code: journalistCode(r.journalistId),
              outlet: j?.outlet ?? "?",
              campaignName: nameById.get(r.campaignId) ?? "",
            };
          }),
        );
      }),
    );
    return groups.flat().sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const markHandled = mutation({
  args: { id: v.id("replies") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    await ctx.db.patch(id, { handled: true });
  },
});

/** 응대 템플릿 변형 적용 → 답장 초안 재생성. */
export const applyReplyTemplate = mutation({
  args: { id: v.id("replies"), variantId: v.string() },
  handler: async (ctx, { id, variantId }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.handled || r.interviewConfirmedAt !== undefined) {
      throw new Error("이미 처리된 회신입니다. 템플릿 변형을 적용할 수 없습니다.");
    }

    const variants = REPLY_TEMPLATE_VARIANTS[r.type as ReplyType] ?? [];
    if (!variants.some((v) => v.id === variantId)) {
      throw new Error("지원하지 않는 템플릿입니다.");
    }

    const slots =
      r.type === "interview" && r.interviewSlots && r.interviewSlots.length >= 3
        ? ([r.interviewSlots[0]!, r.interviewSlots[1]!, r.interviewSlots[2]!] as [
            string,
            string,
            string,
          ])
        : undefined;
    const pr = await ctx.db.get(campaign.pressReleaseId);
    const draftResponse = buildReplyDraftVariant(r.type as ReplyType, variantId, {
      ...(slots ? { slots } : {}),
      ...(pr?.links?.length ? { links: pr.links } : {}),
      ...(r.questionSubtype ? { questionSubtype: r.questionSubtype as QuestionSubtype } : {}),
    });
    await ctx.db.patch(id, { draftResponse, templateVariant: variantId });
    return { variantId };
  },
});

/** 인터뷰 일정 1안 확정 → 답장 초안 갱신 + 처리 완료. */
export const confirmInterviewSlot = mutation({
  args: {
    id: v.id("replies"),
    slot: v.string(),
  },
  handler: async (ctx, { id, slot }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.type !== "interview") throw new Error("인터뷰 회신만 일정을 확정할 수 있습니다.");

    const draftResponse = formatInterviewConfirmDraft(slot);
    await ctx.db.patch(id, {
      interviewPickedSlot: slot,
      interviewConfirmedAt: Date.now(),
      draftResponse,
      handled: true,
    });
    return { slot };
  },
});

/** 인터뷰 슬롯 재생성(기본 3안). */
export const refreshInterviewSlots = mutation({
  args: { id: v.id("replies") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.type !== "interview") throw new Error("인터뷰 회신만 가능합니다.");

    const interviewSlots = [...defaultInterviewSlots()];
    const pr = await ctx.db.get(campaign.pressReleaseId);
    // 사용자가 고른 응대 톤(templateVariant)을 유지한 채 일정만 갱신한다.
    const draftResponse = buildReplyDraftVariant("interview", r.templateVariant ?? "default", {
      slots: [interviewSlots[0]!, interviewSlots[1]!, interviewSlots[2]!],
      ...(pr?.links?.length ? { links: pr.links } : {}),
    });
    await ctx.db.patch(id, { interviewSlots, draftResponse });
    return interviewSlots;
  },
});
