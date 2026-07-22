import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model";
import { classifyReply, buildReplyDraft } from "./lib/replyClassifier";

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

    const { type } = classifyReply(rawBody);
    const draftResponse = buildReplyDraft(type, { lastName: j.name.slice(0, 1) });

    const id = await ctx.db.insert("replies", {
      campaignId,
      journalistId,
      type,
      rawBody,
      draftResponse,
      handled: false,
    });

    // ⑥ 수신거부 → 억제 리스트 영구 등록 (컴플라이언스)
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

    // ④ 게재 통보 → 해당 초안 published 표시(성과 집계)
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
        return { ...r, name: j?.name ?? "?", outlet: j?.outlet ?? "?" };
      }),
    );
  },
});

/** 사용자 전체 미처리 회신(리플라이 인박스). */
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
              name: j?.name ?? "?",
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
