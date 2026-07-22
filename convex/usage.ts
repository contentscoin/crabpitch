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
