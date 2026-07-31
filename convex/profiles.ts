import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return { user, profile };
  },
});

export const ensureProfile = mutation({
  args: { companyName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;
    const user = await ctx.db.get(userId);
    return await ctx.db.insert("profiles", {
      userId,
      companyName: args.companyName ?? user?.name ?? "내 회사",
      plan: "free",
      senderName: user?.name ?? undefined,
      contactEmail: user?.email ?? undefined,
      gmailConnected: false,
    });
  },
});

export const updateProfile = mutation({
  args: {
    companyName: v.optional(v.string()),
    boilerplate: v.optional(v.string()),
    senderName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    plan: v.optional(
      v.union(v.literal("free"), v.literal("solo"), v.literal("growth"), v.literal("agency")),
    ),
    gmailConnected: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("프로필이 없습니다.");
    const { plan, ...rest } = args;
    await ctx.db.patch(profile._id, {
      ...rest,
      ...(plan ? { plan } : {}),
      // 온보딩 ①단계는 "사용자가 직접 저장했다"는 **행위**로 판정한다.
      // 필드 존재로는 판정할 수 없다 — ensureProfile이 companyName·senderName·
      // contactEmail을 자동으로 채우기 때문이다(schema 주석 참고).
      profileConfirmedAt: Date.now(),
    });
    return profile._id;
  },
});
