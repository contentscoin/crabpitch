import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getProfile, requireUser } from "./model";
import { canAccessClientScoped, resolveActiveClientScope } from "./lib/agencyAuth";
import { campaignStatusValidator } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    // 축 판정은 `resolveActiveClientScope` 하나로 모았다 — 온보딩 체크리스트가 같은
    // 판정을 써야 진행률 라벨("이 클라이언트")과 집계 대상이 어긋나지 않는다.
    const clientId = await resolveActiveClientScope(ctx, userId, profile);
    const campaigns = clientId
      ? await ctx.db
          .query("campaigns")
          .withIndex("by_client", (q) => q.eq("agencyClientId", clientId))
          .order("desc")
          .collect()
      : await ctx.db
          .query("campaigns")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .collect();
    // 각 캠페인의 요약 카운트 부착
    return Promise.all(
      campaigns.map(async (c) => {
        const matches = await ctx.db
          .query("matches")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        const drafts = await ctx.db
          .query("emailDrafts")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        const replies = await ctx.db
          .query("replies")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        return {
          ...c,
          matchCount: matches.length,
          draftCount: drafts.length,
          sentCount: drafts.filter((d) => d.status === "sent" || d.status === "published").length,
          replyCount: replies.length,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("campaigns") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(id);
    if (
      !campaign ||
      !(await canAccessClientScoped(ctx, userId, campaign.userId, campaign.agencyClientId))
    ) {
      return null;
    }
    const pressRelease = await ctx.db.get(campaign.pressReleaseId);
    return { campaign, pressRelease };
  },
});

export const create = mutation({
  args: { pressReleaseId: v.id("pressReleases"), name: v.optional(v.string()) },
  handler: async (ctx, { pressReleaseId, name }) => {
    const userId = await requireUser(ctx);
    const pr = await ctx.db.get(pressReleaseId);
    if (
      !pr ||
      !(await canAccessClientScoped(ctx, userId, pr.userId, pr.agencyClientId))
    ) {
      throw new Error("보도자료를 찾을 수 없습니다.");
    }
    const profile = await getProfile(ctx, userId);
    return ctx.db.insert("campaigns", {
      userId: pr.userId,
      pressReleaseId,
      name: name ?? pr.title,
      status: "draft",
      agencyClientId: profile?.activeClientId ?? pr.agencyClientId,
    });
  },
});

export const updateStatus = mutation({
  args: { id: v.id("campaigns"), status: campaignStatusValidator },
  handler: async (ctx, { id, status }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(id);
    if (
      !campaign ||
      !(await canAccessClientScoped(ctx, userId, campaign.userId, campaign.agencyClientId))
    ) {
      throw new Error("권한이 없습니다.");
    }
    await ctx.db.patch(id, { status });
  },
});
