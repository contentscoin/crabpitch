import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { PLAN_LIMITS, currentMonth, type Plan } from "./lib/plans";

/** 이번 달 사용량 + 요금제 한도 + 잔여를 반환. */
export const getMyUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const limits = PLAN_LIMITS[plan];
    const month = currentMonth();
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
      .unique();
    const sendsUsed = usage?.sendsUsed ?? 0;
    const pressReleasesUsed = usage?.pressReleasesUsed ?? 0;
    return {
      plan,
      month,
      limits,
      sendsUsed,
      pressReleasesUsed,
      sendsRemaining: Math.max(0, limits.sends - sendsUsed),
      pressReleasesRemaining: Math.max(0, limits.pressReleases - pressReleasesUsed),
    };
  },
});

/** 대시보드 분석 집계 — 게재·회신 유형·미처리·예약. */
export const getAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let sentCount = 0;
    let publishedCount = 0;
    let queuedCount = 0;
    let replyTotal = 0;
    let unhandledReplies = 0;
    let interviewOpen = 0;
    const replyByType: Record<string, number> = {
      interview: 0,
      materials: 0,
      question: 0,
      published: 0,
      hold: 0,
      unsubscribe: 0,
      complaint: 0,
    };
    let scheduledCampaigns = 0;

    for (const c of campaigns) {
      if (c.scheduledSendAt && c.status === "sending") scheduledCampaigns += 1;
      const drafts = await ctx.db
        .query("emailDrafts")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      for (const d of drafts) {
        if (d.status === "sent") sentCount += 1;
        if (d.status === "published") {
          publishedCount += 1;
          sentCount += 1;
        }
        if (d.status === "queued") queuedCount += 1;
      }
      const replies = await ctx.db
        .query("replies")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      replyTotal += replies.length;
      for (const r of replies) {
        replyByType[r.type] = (replyByType[r.type] ?? 0) + 1;
        if (!r.handled) unhandledReplies += 1;
        if (r.type === "interview" && !r.interviewConfirmedAt && !r.handled) {
          interviewOpen += 1;
        }
      }
    }

    const publishRate = sentCount > 0 ? Math.round((publishedCount / sentCount) * 100) : 0;

    return {
      campaignCount: campaigns.length,
      sentCount,
      publishedCount,
      publishRate,
      queuedCount,
      scheduledCampaigns,
      replyTotal,
      unhandledReplies,
      interviewOpen,
      replyByType,
    };
  },
});
