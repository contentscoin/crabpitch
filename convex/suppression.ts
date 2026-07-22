import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model";
import { maskEmailStrong } from "./lib/mask";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("suppressionList")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    // ⚠️ 실제 이메일은 내려보내지 않는다(강한 마스킹만).
    return rows.map((s) => ({ _id: s._id, reason: s.reason, masked: maskEmailStrong(s.email) }));
  },
});

export const add = mutation({
  args: { email: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { email, reason }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("suppressionList")
      .withIndex("by_user_email", (q) => q.eq("userId", userId).eq("email", email))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("suppressionList", {
      userId,
      email,
      reason: reason ?? "수신거부 요청",
    });
  },
});

export const remove = mutation({
  args: { id: v.id("suppressionList") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("권한이 없습니다.");
    await ctx.db.delete(id);
  },
});
