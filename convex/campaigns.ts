import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getProfile, requireUser } from "./model";
import { canAccessClientScoped, getMembership } from "./lib/agencyAuth";
import { campaignStatusValidator } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    let campaigns;
    if (profile?.activeClientId) {
      const client = await ctx.db.get(profile.activeClientId);
      const member =
        client && (await getMembership(ctx, client.agencyId, userId));
      campaigns = member
        ? await ctx.db
            .query("campaigns")
            .withIndex("by_client", (q) =>
              q.eq("agencyClientId", profile.activeClientId!),
            )
            .order("desc")
            .collect()
        : await ctx.db
            .query("campaigns")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .collect();
    } else {
      campaigns = await ctx.db
        .query("campaigns")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
    }
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

/**
 * 캠페인 생성 — **웹앱과 MCP가 공유하는 단일 구현.**
 * `userId`를 인자로 받는다: MCP에는 로그인 세션이 없고 키로 사용자를 찾는다.
 */
export async function createCampaignForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  { pressReleaseId, name }: { pressReleaseId: Id<"pressReleases">; name?: string },
): Promise<Id<"campaigns">> {
  const pr = await ctx.db.get(pressReleaseId);
  if (!pr || !(await canAccessClientScoped(ctx, userId, pr.userId, pr.agencyClientId))) {
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
}

export const create = mutation({
  args: { pressReleaseId: v.id("pressReleases"), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return createCampaignForUser(ctx, userId, args);
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
