import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser, getProfile, bumpSends } from "./model";
import { normalizeEmail, suppressedEmailSet } from "./lib/sendGuard";

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

/** 캠페인 초안에 Gmail draft id 기록 + sent 표시 (액션 전용). */
export const markDraftsSentWithGmail = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    updates: v.array(
      v.object({
        draftId: v.id("emailDrafts"),
        gmailDraftId: v.optional(v.string()),
      }),
    ),
    sendCount: v.number(),
    userId: v.id("users"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const u of args.updates) {
      await ctx.db.patch(u.draftId, {
        status: "sent",
        sentAt: now,
        ...(u.gmailDraftId ? { gmailDraftId: u.gmailDraftId } : {}),
      });
    }
    await bumpSends(ctx, args.userId, args.sendCount);
    await ctx.db.patch(args.campaignId, { status: "sent" });
    return args.sendCount;
  },
});

export const listPendingDraftsInternal = internalQuery({
  args: { campaignId: v.id("campaigns"), userId: v.id("users") },
  returns: v.array(
    v.object({
      draftId: v.id("emailDrafts"),
      subject: v.string(),
      body: v.string(),
      journalistName: v.string(),
      journalistEmail: v.string(),
    }),
  ),
  handler: async (ctx, { campaignId, userId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return [];

    // 발송 직전 억제 리스트 재대조 — sendCampaign·executeScheduledSend와 동일하게
    // Gmail 초안 경로도 초안 생성 이후 수신거부한 기자를 걸러낸다.
    const suppressionRows = await ctx.db
      .query("suppressionList")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const suppressed = suppressedEmailSet(suppressionRows.map((r) => r.email));

    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    const pending = drafts.filter((d) => d.status === "draft" || d.status === "queued");
    const rows = [];
    for (const d of pending) {
      const j = await ctx.db.get(d.journalistId);
      if (!j || suppressed.has(normalizeEmail(j.email))) continue;
      rows.push({
        draftId: d._id,
        subject: d.subject,
        body: d.body,
        journalistName: j.name,
        journalistEmail: j.email,
      });
    }
    return rows;
  },
});
