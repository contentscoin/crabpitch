import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
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

/* ── 오픈크랩 팩 동기화 (트랙 A) ──────────────────────────────
 * ⚠️ PII 무노출 원칙: 이 영역의 모든 쿼리는 **집계·메타만** 돌려준다.
 *    기자 이름·이메일·연락처를 열람하는 UI를 만들지 않는다.
 */

/** 액션에서 관리자 권한을 확인할 때 사용(액션은 ctx.db가 없다). */
export const assertPlatformAdminInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => await isPlatformAdmin(ctx, userId),
});

/** 팩 동기화 현황 — 배치별 상태·소스별 카운트·데이터 기준일·신규 시리즈·stale 카운트. */
export const packSyncOverview = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);

    const packs = await ctx.db.query("opencrabPacks").collect();
    const runs = await ctx.db
      .query("packSyncRuns")
      .withIndex("by_startedAt")
      .order("desc")
      .take(200);
    const journalists = await ctx.db.query("journalists").collect();

    // 팩별 최신 run
    const latestRun = new Map<string, (typeof runs)[number]>();
    for (const r of runs) {
      if (!latestRun.has(r.packageId)) latestRun.set(r.packageId, r);
    }

    const bySource: Record<string, number> = {};
    let latestArticleAt: number | undefined;
    let staleCount = 0;
    let missingCategory = 0;
    const now = Date.now();
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;

    for (const j of journalists) {
      const src = j.source ?? "unknown";
      bySource[src] = (bySource[src] ?? 0) + 1;
      if (j.latestArticleAt && (!latestArticleAt || j.latestArticleAt > latestArticleAt)) {
        latestArticleAt = j.latestArticleAt;
      }
      if (j.source === "opencrab") {
        const seen = j.lastSeenInPackAt;
        if (seen === undefined || now - seen > STALE_MS) staleCount += 1;
        if (!j.outletCategory) missingCategory += 1;
      }
    }

    return {
      journalistTotal: journalists.length,
      bySource,
      /** 근거 기사 최신일 — "데이터 기준일" */
      latestArticleAt,
      /** 팩에서 최근 확인되지 않은 레코드 수(이직·퇴사 추정) */
      staleCount,
      missingCategory,
      packs: packs
        .map((p) => {
          const run = latestRun.get(p.packageId);
          return {
            packageId: p.packageId,
            series: p.series,
            batch: p.batch,
            name: p.name,
            syncEnabled: p.syncEnabled,
            recordCount: p.recordCount,
            capturedAt: p.capturedAt,
            lastSyncedAt: p.lastSyncedAt,
            lastStatus: run?.status,
            lastFetched: run?.fetched,
            lastError: run?.error,
          };
        })
        .sort((a, b) => (a.batch ?? a.series).localeCompare(b.batch ?? b.series)),
      /** 자동 동기화 대상이 아닌(승인 대기) 신규·파생 시리즈 */
      pendingApproval: packs
        .filter((p) => !p.syncEnabled)
        .map((p) => ({ packageId: p.packageId, name: p.name, series: p.series })),
      recentRuns: runs.slice(0, 30).map((r) => ({
        packageId: r.packageId,
        status: r.status,
        startedAt: r.startedAt,
        fetched: r.fetched,
        recordCount: r.recordCount,
        inserted: r.inserted,
        updated: r.updated,
        error: r.error,
        trigger: r.trigger,
      })),
    };
  },
});

/** 신규·파생 시리즈 팩의 자동 동기화 여부를 관리자가 승인/해제한다(자동 전환 금지). */
export const setPackSyncEnabled = mutation({
  args: { packageId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { packageId, enabled }) => {
    await requirePlatformAdmin(ctx);
    const pack = await ctx.db
      .query("opencrabPacks")
      .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
      .unique();
    if (!pack) throw new Error("팩을 찾을 수 없습니다.");
    await ctx.db.patch(pack._id, { syncEnabled: enabled });
    return null;
  },
});
