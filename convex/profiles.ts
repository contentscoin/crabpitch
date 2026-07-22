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
    });
    return profile._id;
  },
});
