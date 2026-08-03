import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { planValidator } from "./schema";
import { currentMonth, PLAN_LIMITS, type Plan } from "./lib/plans";
import {
  isPlatformAdmin,
  requirePlatformAdmin,
} from "./lib/platformAdmin";
import { requireUser, getProfile } from "./model";
import { journalistCode } from "./lib/mask";
import { EXCLUDE_STALE_KEY, STALE_MATCH_DAYS } from "./journalists";
import { PR_PRESSKIT_PACK } from "./lib/packRegistry";

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

/**
 * 목록 페이징 공통 처리.
 *
 * 필터를 좁히면 현재 페이지가 범위를 벗어난다 — 빈 화면 대신 마지막 페이지로 당긴다.
 * 화면마다 이 계산을 다시 쓰면 그중 하나가 반드시 어긋난다.
 */
function paginate<T>(
  rows: readonly T[],
  page?: number,
  pageSize?: number,
  { max = 200, fallback = 25 }: { max?: number; fallback?: number } = {},
) {
  const size = Math.min(max, Math.max(5, pageSize ?? fallback));
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(1, Math.floor(page ?? 1)), pageCount);
  return {
    rows: rows.slice((safePage - 1) * size, safePage * size),
    page: safePage,
    pageSize: size,
    pageCount,
    matched: rows.length,
  };
}

const pagingArgs = {
  page: v.optional(v.number()),
  pageSize: v.optional(v.number()),
  /** 이메일·회사명 부분 일치(대소문자 무시) */
  search: v.optional(v.string()),
} as const;

export const listUsers = query({
  args: pagingArgs,
  returns: v.object({
    total: v.number(),
    matched: v.number(),
    page: v.number(),
    pageSize: v.number(),
    pageCount: v.number(),
    users: v.array(
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
  }),
  handler: async (ctx, { page, pageSize, search }) => {
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

    const all = users
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

    // 사용자가 늘면 이 목록은 끝없이 길어진다. 찾는 사람이 정해져 있을 때는
    // 페이지를 넘기는 것보다 검색이 빠르다.
    const needle = search?.trim().toLowerCase() ?? "";
    const filtered = needle
      ? all.filter(
          (u) =>
            (u.email ?? "").toLowerCase().includes(needle) ||
            (u.companyName ?? "").toLowerCase().includes(needle) ||
            (u.name ?? "").toLowerCase().includes(needle),
        )
      : all;

    const { rows, ...meta } = paginate(filtered, page, pageSize);
    return { total: all.length, ...meta, users: rows };
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
  args: pagingArgs,
  returns: v.object({
    total: v.number(),
    matched: v.number(),
    page: v.number(),
    pageSize: v.number(),
    pageCount: v.number(),
    activeCount: v.number(),
    keys: v.array(
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
  }),
  handler: async (ctx, { page, pageSize, search }) => {
    await requirePlatformAdmin(ctx);
    const keys = await ctx.db.query("userMcpKeys").collect();
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const userById = new Map(users.map((u) => [u._id, u]));
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const all = keys
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

    const needle = search?.trim().toLowerCase() ?? "";
    const filtered = needle
      ? all.filter(
          (k) =>
            (k.email ?? "").toLowerCase().includes(needle) ||
            k.name.toLowerCase().includes(needle) ||
            k.keyPrefix.toLowerCase().includes(needle),
        )
      : all;

    const { rows, ...meta } = paginate(filtered, page, pageSize);
    return {
      total: all.length,
      // 폐기된 키는 목록에 남지만 "살아 있는 키 몇 개"가 실제로 궁금한 값이다.
      activeCount: all.filter((k) => !k.revoked).length,
      ...meta,
      keys: rows,
    };
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

/**
 * 관리자용 기자 디렉터리 — **집계 + 마스킹 목록**.
 *
 * "리스트가 다 안 뜬다"를 진단하려면 DB에 실제로 무엇이 몇 건 있는지, 그중 몇 건이
 * 매칭에서 걸러지는지를 봐야 한다. 총계만으로는 원인을 못 가린다.
 *
 * ⚠️ 위 PII 무노출 원칙을 그대로 지킨다 — 이름·이메일·연락처는 넣지 않는다.
 *    진단에 필요한 건 출처·신선도·신뢰도이지 신원이 아니다.
 */
/**
 * 기자 디렉터리 — **서버에서 한 페이지만 잘라 보낸다.**
 *
 * 예전에는 1,700여 건을 통째로 클라이언트로 내려보냈다. 관리자가 실제로 보는 것은
 * 한 화면 분량인데, 나머지는 전송·파싱 비용만 내고 버려진다.
 *
 * 집계(출처별·신뢰도별·stale)는 전수를 봐야 나오므로 스캔은 남는다. 줄인 것은 **페이로드**다.
 * 스캔 자체를 줄이려면 카운터 테이블이 필요하고, 그건 별개의 작업이다.
 */
export const listJournalists = query({
  args: {
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    /** "opencrab" | "manual" | "seed" … 지정하면 그 출처만 */
    source: v.optional(v.string()),
    /** 켜면 stale 레코드만 — 이직·퇴사 추정분을 훑을 때 쓴다 */
    staleOnly: v.optional(v.boolean()),
    /** 매체명 부분 일치(대소문자 무시) */
    search: v.optional(v.string()),
  },
  handler: async (ctx, { page, pageSize, source, staleOnly, search }) => {
    await requirePlatformAdmin(ctx);
    const all = await ctx.db.query("journalists").collect();

    const staleBefore = Date.now() - STALE_MATCH_DAYS * 24 * 60 * 60 * 1000;
    const setting = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", EXCLUDE_STALE_KEY))
      .unique();
    const excludeStale = setting?.boolValue === true;

    /** 팩 유래인데 30일 넘게 팩에서 확인되지 않은 레코드(이직·퇴사 추정). */
    const isStale = (j: Doc<"journalists">) =>
      j.source === "opencrab" &&
      !(j.lastSeenInPackAt !== undefined && j.lastSeenInPackAt >= staleBefore);

    // 집계는 **필터 전 전체** 기준이다 — 필터를 걸 때마다 총계가 바뀌면
    // "전체 몇 명인가"를 볼 수 없다.
    const bySource: Record<string, number> = {};
    const byConfidence: Record<string, number> = {};
    for (const j of all) {
      const src = j.source ?? "unknown";
      bySource[src] = (bySource[src] ?? 0) + 1;
      byConfidence[j.contactConfidence] = (byConfidence[j.contactConfidence] ?? 0) + 1;
    }
    const staleCount = all.filter(isStale).length;

    const needle = search?.trim().toLowerCase() ?? "";
    const filtered = all.filter((j) => {
      if (source && (j.source ?? "unknown") !== source) return false;
      if (staleOnly && !isStale(j)) return false;
      if (needle && !j.outlet.toLowerCase().includes(needle)) return false;
      return true;
    });

    const size = Math.min(200, Math.max(10, pageSize ?? 50));
    const pageCount = Math.max(1, Math.ceil(filtered.length / size));
    // 필터를 좁히면 현재 페이지가 범위를 벗어난다 — 빈 화면 대신 마지막 페이지로 당긴다.
    const safePage = Math.min(Math.max(1, Math.floor(page ?? 1)), pageCount);

    const rows = filtered
      .slice()
      .sort((a, b) => b.referenceArticleCount - a.referenceArticleCount)
      .slice((safePage - 1) * size, safePage * size)
      .map((j) => ({
        _id: j._id,
        code: journalistCode(j._id),
        outlet: j.outlet,
        beatPrimary: j.beatPrimary,
        beatSecondary: j.beatSecondary,
        contactConfidence: j.contactConfidence,
        referenceArticleCount: j.referenceArticleCount,
        source: j.source ?? "unknown",
        outletCategory: j.outletCategory ?? null,
        lastSeenInPackAt: j.lastSeenInPackAt ?? null,
        packSyncedAt: j.packSyncedAt ?? null,
        stale: isStale(j),
      }));

    return {
      total: all.length,
      /** 필터 적용 후 건수 — 페이지네이션의 기준 */
      matched: filtered.length,
      shown: rows.length,
      page: safePage,
      pageSize: size,
      pageCount,
      bySource,
      byConfidence,
      staleCount,
      /** 켜져 있으면 stale 레코드가 매칭 후보에서 빠진다 */
      excludeStale,
      /** 매칭 1회가 만드는 최대 후보 수 — "왜 15명만 나오지"의 답 */
      matchTopKDefault: 15,
      journalists: rows,
    };
  },
});

/**
 * 기자 데이터 집계만 — 팩 동기화 화면이 쓴다.
 *
 * 예전에는 `packSyncOverview`가 이 계산을 직접 했다. 그래서 관리자 화면 한 번 여는 데
 * `getOverview`·`listJournalists`·`packSyncOverview`가 **각각** 전수 스캔을 돌렸다.
 * 집계를 여기 하나로 모아 두면 화면을 나눌 때 필요한 쪽만 부를 수 있다.
 */
export const journalistStats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    bySource: v.record(v.string(), v.number()),
    latestArticleAt: v.optional(v.number()),
    staleCount: v.number(),
    missingCategory: v.number(),
    fromPacks: v.number(),
  }),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const journalists = await ctx.db.query("journalists").collect();

    const bySource: Record<string, number> = {};
    let latestArticleAt: number | undefined;
    let staleCount = 0;
    let missingCategory = 0;
    let fromPacks = 0;
    const now = Date.now();
    const STALE_MS = STALE_MATCH_DAYS * 24 * 60 * 60 * 1000;

    for (const j of journalists) {
      const src = j.source ?? "unknown";
      bySource[src] = (bySource[src] ?? 0) + 1;
      if (j.latestArticleAt && (!latestArticleAt || j.latestArticleAt > latestArticleAt)) {
        latestArticleAt = j.latestArticleAt;
      }
      if (j.source === "opencrab") {
        fromPacks += 1;
        const seen = j.lastSeenInPackAt;
        if (seen === undefined || now - seen > STALE_MS) staleCount += 1;
        if (!j.outletCategory) missingCategory += 1;
      }
    }

    return {
      total: journalists.length,
      bySource,
      latestArticleAt,
      staleCount,
      missingCategory,
      fromPacks,
    };
  },
});

/**
 * 발송 테스트용 기자 1명 시드.
 *
 * `seed.run`은 기자 DB가 비었을 때만 돌아서, 팩 동기화로 데이터가 들어온 뒤에는
 * 쓸 수 없다. 실제 수신 가능한 주소로 발송 경로 전체(매칭 → 초안 → 승인 → Gmail)를
 * 끝까지 확인하려면 별도 경로가 필요하다.
 *
 * - `source: "manual"` — 팩 유래가 아니므로 stale 판정 대상이 아니다.
 * - `contactConfidence: "high"` — low면 승인 화면에서 기본 해제돼 테스트가 한 단계 늘어난다.
 * - beat를 넓게 잡아 어떤 주제의 캠페인에도 매칭에 걸리게 한다.
 * - `mailingStatus: "candidate"` — 테스트라고 컴플라이언스 전제를 바꾸지 않는다.
 *
 * 이메일이 같으면 다시 만들지 않는다(중복 발송 방지).
 *
 * 수신 주소를 **인자로 받는다.** 하나로 고정해 두면 7일 쿨다운에 걸린 뒤로는 그 주소로
 * 다시 보낼 수 없어 문안·첨부를 고쳐도 실물을 확인할 방법이 없다. 쿨다운은 기자별이므로
 * 테스트 수신처를 하나 더 두면 게이트를 건드리지 않고 확인할 수 있다.
 */
export const seedTestJournalist = mutation({
  args: {
    /** 실제로 받아 볼 수 있는 주소. 생략하면 기본 테스트 주소. */
    email: v.optional(v.string()),
    /** 목록에서 구분하기 위한 이름. 생략하면 김테스트. */
    name: v.optional(v.string()),
  },
  returns: v.object({
    created: v.boolean(),
    journalistId: v.id("journalists"),
    /** 매칭·초안 화면에서 이 레코드를 찾을 때 쓰는 익명 코드. */
    code: v.string(),
  }),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const email = (args.email ?? "hiway@kakao.com").trim().toLowerCase();
    // 실제로 메일이 나가는 주소다 — 형식이 깨진 값을 넣으면 발송 루프가 그 건에서 실패한다.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("이메일 형식이 올바르지 않습니다.");
    }
    const existing = (await ctx.db.query("journalists").collect()).find(
      (j) => j.email === email,
    );
    if (existing) {
      return { created: false, journalistId: existing._id, code: journalistCode(existing._id) };
    }

    const journalistId = await ctx.db.insert("journalists", {
      name: args.name?.trim() || "김테스트",
      outlet: "테스트매체",
      email,
      beatPrimary: "AI/데이터",
      beatSecondary: [
        "IT/과학",
        "스타트업",
        "플랫폼/인터넷",
        "정책/공공",
        "유통/커머스",
        "기타",
      ],
      contactConfidence: "high",
      referenceArticleCount: 1,
      topReferenceTitle: "발송 테스트용 레코드",
      mailingStatus: "candidate",
      source: "manual",
    });
    return { created: true, journalistId, code: journalistCode(journalistId) };
  },
});

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
    // ⚠️ 기자 전수 스캔은 여기서 하지 않는다 — `admin.journalistStats`가 담당한다.
    //    예전에는 이 쿼리와 `getOverview`·`listJournalists`가 각각 스캔을 돌려서,
    //    관리자 화면 한 번 여는 데 1,700여 건을 세 번 훑었다.

    // 팩별 최신 run
    const latestRun = new Map<string, (typeof runs)[number]>();
    for (const r of runs) {
      if (!latestRun.has(r.packageId)) latestRun.set(r.packageId, r);
    }

    return {
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
      /**
       * PR 지식 팩의 새 시리즈가 발행되면 `convex/lib/pressGuide.ts`의 상수를 다시 대조해야 한다
       * (그 파일이 규범의 정본이고, 각 블록에 추출 근거 문서 ID가 주석으로 박혀 있다).
       * 자동 전환은 하지 않고 재대조가 필요하다는 사실만 띄운다.
       */
      pressGuideRecheck: packs
        .filter((p) => p.series === "pr-presskit" && p.packageId !== PR_PRESSKIT_PACK.packageId)
        .map((p) => ({ packageId: p.packageId, name: p.name, capturedAt: p.capturedAt })),
      /**
       * 정합성 — reference 팩이 선언한 인원.
       * 실제 반입된 팩 유래 기자 수(`fromPacks`)는 `journalistStats`가 준다.
       * 배치 팩 결손(예: batch-025)이 있으면 둘의 차이로 드러난다.
       */
      integrity: {
        expected: packs.find((p) => p.series === "journalist-reference")?.recordCount,
      },
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

/**
 * 팩 동기화 실행 이력 — **별도 화면(`/admin/logs`)용.**
 *
 * 요약 화면에 30건을 통째로 붙여 두면 스크롤만 길어지고, 정작 실패를 파고들 때는
 * 30건으로 부족하다. 목적이 다르므로 화면을 나누고 쿼리도 나눈다.
 *
 * `by_startedAt` 인덱스 역순으로 최근 것부터 본다. 이력은 오래될수록 볼 일이 줄어드므로
 * 전수를 훑지 않고 상한(1,000건)까지만 가져와 그 안에서 거른다.
 */
export const listPackSyncRuns = query({
  args: {
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    /** "ok" | "partial" | "failed" — 미지정이면 전체 */
    status: v.optional(v.string()),
    packageId: v.optional(v.string()),
    /** 실패·결손만 — 사고를 쫓을 때 쓰는 단축 필터 */
    problemsOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { page, pageSize, status, packageId, problemsOnly }) => {
    await requirePlatformAdmin(ctx);

    const runs = await ctx.db
      .query("packSyncRuns")
      .withIndex("by_startedAt")
      .order("desc")
      .take(1000);

    // 팩 이름은 이력에 없다 — 표에 packageId만 뜨면 어느 팩인지 알 수 없다.
    const packs = await ctx.db.query("opencrabPacks").collect();
    const nameById = new Map(
      packs.map((p) => [p.packageId, p.name ?? p.batch ?? p.series]),
    );

    const byStatus: Record<string, number> = {};
    for (const r of runs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    const filtered = runs.filter((r) => {
      if (status && r.status !== status) return false;
      if (packageId && r.packageId !== packageId) return false;
      if (problemsOnly && r.status === "ok") return false;
      return true;
    });

    const { rows, ...meta } = paginate(filtered, page, pageSize, { fallback: 30 });

    return {
      total: runs.length,
      byStatus,
      ...meta,
      /** 필터 드롭다운용 — 이력에 실제로 등장한 팩만 */
      packOptions: [...new Set(runs.map((r) => r.packageId))]
        .map((id) => ({ packageId: id, name: nameById.get(id) ?? id.slice(0, 8) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      runs: rows.map((r) => ({
        _id: r._id,
        packageId: r.packageId,
        packName: nameById.get(r.packageId) ?? `${r.packageId.slice(0, 8)}…`,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt ?? null,
        recordCount: r.recordCount ?? null,
        fetched: r.fetched,
        inserted: r.inserted,
        updated: r.updated,
        error: r.error ?? null,
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

/** 팩 미확인(stale) 기자를 매칭에서 기본 제외할지 — 관리자 스위치. */
export const getMatchingPolicy = query({
  args: {},
  returns: v.object({ excludeStaleMatches: v.boolean(), staleDays: v.number() }),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", EXCLUDE_STALE_KEY))
      .unique();
    return {
      excludeStaleMatches: row?.boolValue === true,
      staleDays: STALE_MATCH_DAYS,
    };
  },
});

export const setMatchingPolicy = mutation({
  args: { excludeStaleMatches: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { excludeStaleMatches }) => {
    await requirePlatformAdmin(ctx);
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", EXCLUDE_STALE_KEY))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { boolValue: excludeStaleMatches, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("platformSettings", {
        key: EXCLUDE_STALE_KEY,
        boolValue: excludeStaleMatches,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
