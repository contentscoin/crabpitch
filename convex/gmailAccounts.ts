import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser, getProfile } from "./model";

export const getConnection = query({
  args: {},
  returns: v.union(
    v.object({
      connected: v.literal(true),
      email: v.string(),
    }),
    v.object({ connected: v.literal(false) }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("gmailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return { connected: false as const };
    return { connected: true as const, email: account.email };
  },
});

export const createOauthState = internalMutation({
  args: { userId: v.id("users"), state: v.string() },
  returns: v.id("gmailOauthStates"),
  handler: async (ctx, { userId, state }) => {
    const old = await ctx.db
      .query("gmailOauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (old) await ctx.db.delete(old._id);
    return await ctx.db.insert("gmailOauthStates", {
      userId,
      state,
      createdAt: Date.now(),
    });
  },
});

export const consumeOauthState = internalMutation({
  args: { state: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("gmailOauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (!row) return null;
    // 10분 만료
    if (Date.now() - row.createdAt > 10 * 60 * 1000) {
      await ctx.db.delete(row._id);
      return null;
    }
    const userId = row.userId;
    await ctx.db.delete(row._id);
    return userId;
  },
});

export const upsertAccount = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiryDate: v.optional(v.number()),
    scope: v.optional(v.string()),
  },
  returns: v.id("gmailAccounts"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("gmailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        expiryDate: args.expiryDate,
        scope: args.scope,
      });
    } else {
      await ctx.db.insert("gmailAccounts", {
        userId: args.userId,
        email: args.email,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiryDate: args.expiryDate,
        scope: args.scope,
      });
    }
    const profile = await getProfile(ctx, args.userId);
    if (profile) {
      await ctx.db.patch(profile._id, { gmailConnected: true });
    }
    const account = await ctx.db
      .query("gmailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return account!._id;
  },
});

export const getAccountInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("gmailAccounts"),
      email: v.string(),
      accessToken: v.string(),
      refreshToken: v.optional(v.string()),
      expiryDate: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("gmailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;
    return {
      _id: account._id,
      email: account.email,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiryDate: account.expiryDate,
    };
  },
});

export const patchTokens = internalMutation({
  args: {
    accountId: v.id("gmailAccounts"),
    accessToken: v.string(),
    expiryDate: v.optional(v.number()),
    refreshToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      accessToken: args.accessToken,
      expiryDate: args.expiryDate,
      ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
    });
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("gmailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (account) await ctx.db.delete(account._id);
    const profile = await getProfile(ctx, userId);
    if (profile) await ctx.db.patch(profile._id, { gmailConnected: false });
    return null;
  },
});

/* 발송 확정·초안 선별은 `drafts.selectForGmailSend` / `drafts.confirmGmailSent`가 한다.
 * 예전에는 이 파일에 따로 있었고, 그래서 Gmail 경로만 쿨다운·표현 규정·상한을 건너뛰었다.
 * 게이트를 경로마다 두면 하나가 반드시 샌다 — 확정 로직은 drafts.ts 한 곳에만 둔다. */
