import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { planValidator } from "./schema";
import { currentMonth, PLAN_LIMITS, type Plan } from "./lib/plans";
import {
  isPlatformAdmin,
  requirePlatformAdmin,
} from "./lib/platformAdmin";
import { requireUser, getProfile } from "./model";

export const getAccess = query({
  args: {},
  returns: v.object({
    allowed: v.boolean(),
    email: v.union(v.string(), v.null()),
    via: v.union(
      v.literal("profile"),
      v.literal("email_allowlist"),
      v.literal("none"),
    ),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = user?.email ?? null;
    const profile = await getProfile(ctx, userId);
    if (profile?.isPlatformAdmin) {
      return { allowed: true, email, via: "profile" as const };
    }
    const allowed = await isPlatformAdmin(ctx, userId);
    return {
      allowed,
      email,
      via: allowed ? ("email_allowlist" as const) : ("none" as const),
    };
  },
});

export const getOverview = query({
  args: {},
  returns: v.object({
    users: v.number(),
    profiles: v.number(),
    journalists: v.number(),
    campaigns: v.number(),
    pressReleases: v.number(),
    activeMcpKeys: v.number(),
    agencies: v.number(),
    plans: v.object({
      free: v.number(),
      solo: v.number(),
      growth: v.number(),
      agency: v.number(),
    }),
    month: v.string(),
    integrations: v.object({
      opencrab: v.boolean(),
      gmailOAuth: v.boolean(),
      anthropic: v.boolean(),
      mcpHttp: v.boolean(),
      adminEmailsConfigured: v.boolean(),
    }),
  }),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);

    const [
      users,
      profiles,
      journalists,
      campaigns,
      pressReleases,
      mcpKeys,
      agencies,
    ] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("profiles").collect(),
      ctx.db.query("journalists").collect(),
      ctx.db.query("campaigns").collect(),
      ctx.db.query("pressReleases").collect(),
      ctx.db.query("userMcpKeys").collect(),
      ctx.db.query("agencies").collect(),
    ]);

    const plans = { free: 0, solo: 0, growth: 0, agency: 0 };
    for (const p of profiles) {
      const plan = p.plan as Plan;
      if (plan in plans) plans[plan] += 1;
    }

    return {
      users: users.length,
      profiles: profiles.length,
      journalists: journalists.length,
      campaigns: campaigns.length,
      pressReleases: pressReleases.length,
      activeMcpKeys: mcpKeys.filter((k) => !k.revoked).length,
      agencies: agencies.length,
      plans,
      month: currentMonth(),
      integrations: {
        opencrab: Boolean(
          process.env.OPENCRAB_API_URL?.trim() &&
            process.env.OPENCRAB_API_KEY?.trim(),
        ),
        gmailOAuth: Boolean(
          (process.env.GMAIL_OAUTH_CLIENT_ID?.trim() &&
            process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim()) ||
            (process.env.AUTH_GOOGLE_ID?.trim() &&
              process.env.AUTH_GOOGLE_SECRET?.trim()),
        ),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        mcpHttp: true,
        adminEmailsConfigured: Boolean(process.env.ADMIN_EMAILS?.trim()),
      },
    };
  },
});

export const listUsers = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      profileId: v.union(v.id("profiles"), v.null()),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      companyName: v.union(v.string(), v.null()),
      plan: v.string(),
      isPlatformAdmin: v.boolean(),
      gmailConnected: v.boolean(),
      sendsUsed: v.number(),
      pressReleasesUsed: v.number(),
      mcpKeyCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const month = currentMonth();
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const usageRows = await ctx.db.query("usage").collect();
    const mcpKeys = await ctx.db.query("userMcpKeys").collect();

    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const usageByUser = new Map(
      usageRows.filter((u) => u.month === month).map((u) => [u.userId, u]),
    );
    const mcpCountByUser = new Map<Id<"users">, number>();
    for (const k of mcpKeys) {
      if (k.revoked) continue;
      mcpCountByUser.set(k.userId, (mcpCountByUser.get(k.userId) ?? 0) + 1);
    }

    return users
      .map((u) => {
        const profile = profileByUser.get(u._id);
        const usage = usageByUser.get(u._id);
        return {
          userId: u._id,
          profileId: profile?._id ?? null,
          name: u.name ?? null,
          email: u.email ?? null,
          companyName: profile?.companyName ?? null,
          plan: profile?.plan ?? "free",
          isPlatformAdmin: Boolean(profile?.isPlatformAdmin),
          gmailConnected: Boolean(profile?.gmailConnected),
          sendsUsed: usage?.sendsUsed ?? 0,
          pressReleasesUsed: usage?.pressReleasesUsed ?? 0,
          mcpKeyCount: mcpCountByUser.get(u._id) ?? 0,
        };
      })
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "", "ko"));
  },
});

export const setUserPlan = mutation({
  args: {
    userId: v.id("users"),
    plan: planValidator,
  },
  returns: v.null(),
  handler: async (ctx, { userId, plan }) => {
    await requirePlatformAdmin(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("해당 사용자의 프로필이 없습니다.");
    await ctx.db.patch(profile._id, { plan });
    return null;
  },
});

export const setPlatformAdminFlag = mutation({
  args: {
    userId: v.id("users"),
    isPlatformAdmin: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, isPlatformAdmin: flag }) => {
    const { userId: actorId } = await requirePlatformAdmin(ctx);
    if (userId === actorId && !flag) {
      throw new Error("자신의 관리자 권한은 해제할 수 없습니다.");
    }
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("해당 사용자의 프로필이 없습니다.");
    await ctx.db.patch(profile._id, { isPlatformAdmin: flag });
    return null;
  },
});

export const listMcpKeys = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("userMcpKeys"),
      userId: v.id("users"),
      email: v.union(v.string(), v.null()),
      name: v.string(),
      keyPrefix: v.string(),
      createdAt: v.number(),
      lastUsedAt: v.union(v.number(), v.null()),
      revoked: v.boolean(),
      plan: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const keys = await ctx.db.query("userMcpKeys").collect();
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const userById = new Map(users.map((u) => [u._id, u]));
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    return keys
      .map((k) => {
        const user = userById.get(k.userId);
        const profile = profileByUser.get(k.userId);
        return {
          _id: k._id,
          userId: k.userId,
          email: user?.email ?? null,
          name: k.name,
          keyPrefix: k.keyPrefix,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt ?? null,
          revoked: k.revoked,
          plan: profile?.plan ?? "free",
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const revokeMcpKey = mutation({
  args: { keyId: v.id("userMcpKeys") },
  returns: v.null(),
  handler: async (ctx, { keyId }) => {
    await requirePlatformAdmin(ctx);
    const key = await ctx.db.get(keyId);
    if (!key) throw new Error("키를 찾을 수 없습니다.");
    await ctx.db.patch(keyId, { revoked: true });
    return null;
  },
});

const planLimitsValidator = v.object({
  label: v.string(),
  price: v.number(),
  sends: v.number(),
  pressReleases: v.number(),
  matchReveal: v.number(),
  mediaKits: v.number(),
  mcp: v.boolean(),
});

export const planLimits = query({
  args: {},
  returns: v.object({
    free: planLimitsValidator,
    solo: planLimitsValidator,
    growth: planLimitsValidator,
    agency: planLimitsValidator,
  }),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    return PLAN_LIMITS;
  },
});
