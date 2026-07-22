import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, getProfile, bumpPressReleases } from "./model";
import { PLAN_LIMITS, currentMonth, type Plan } from "./lib/plans";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return ctx.db
      .query("pressReleases")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("pressReleases") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const pr = await ctx.db.get(id);
    if (!pr || pr.userId !== userId) return null;
    return pr;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    headlines: v.array(v.string()),
    body: v.string(),
    topicTags: v.array(v.string()),
    who: v.optional(v.string()),
    newsValue: v.optional(v.string()),
    numbers: v.optional(v.string()),
    quote: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    // 무료 티어 보도자료 월 한도 체크
    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const month = currentMonth();
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
      .unique();
    if ((usage?.pressReleasesUsed ?? 0) >= PLAN_LIMITS[plan].pressReleases) {
      throw new Error(
        `이번 달 보도자료 작성 한도(${PLAN_LIMITS[plan].pressReleases}건)를 초과했습니다. 플랜을 업그레이드하세요.`,
      );
    }

    const id = await ctx.db.insert("pressReleases", {
      userId,
      title: args.title,
      headlines: args.headlines,
      body: args.body,
      topicTags: args.topicTags,
      who: args.who,
      newsValue: args.newsValue,
      numbers: args.numbers,
      quote: args.quote,
      links: args.links,
      status: "ready",
    });
    await bumpPressReleases(ctx, userId, 1);
    return id;
  },
});
