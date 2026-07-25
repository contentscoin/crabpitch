import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser, getProfile } from "./model";
import {
  generateApiKey,
  requireAgencyMember,
  requireAgencyPlan,
  sha256Hex,
} from "./lib/agencyAuth";

/** 내가 속한 에이전시 목록. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query("agencyMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return Promise.all(
      memberships.map(async (m) => {
        const agency = await ctx.db.get(m.agencyId);
        return agency
          ? { ...agency, role: m.role }
          : null;
      }),
    ).then((rows) => rows.filter(Boolean));
  },
});

/** 현재 활성 에이전시·클라이언트 컨텍스트. */
export const getActiveContext = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile?.activeAgencyId) {
      return { agency: null, client: null, plan: profile?.plan ?? "free" };
    }
    const agency = await ctx.db.get(profile.activeAgencyId);
    const client = profile.activeClientId
      ? await ctx.db.get(profile.activeClientId)
      : null;
    return {
      agency,
      client,
      plan: profile.plan,
    };
  },
});

/** Agency 플랜 사용자용 워크스페이스 생성. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    await requireAgencyPlan(ctx, userId);
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new Error("에이전시 이름을 입력하세요.");

    const agencyId = await ctx.db.insert("agencies", {
      name: trimmed,
      ownerUserId: userId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("agencyMembers", {
      agencyId,
      userId,
      role: "owner",
    });
    const profile = await getProfile(ctx, userId);
    if (profile) {
      await ctx.db.patch(profile._id, {
        activeAgencyId: agencyId,
        activeClientId: undefined,
      });
    }
    return agencyId;
  },
});

export const listClients = query({
  args: { agencyId: v.id("agencies") },
  handler: async (ctx, { agencyId }) => {
    const userId = await requireUser(ctx);
    await requireAgencyMember(ctx, agencyId, userId);
    return ctx.db
      .query("agencyClients")
      .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
      .collect();
  },
});

export const createClient = mutation({
  args: {
    agencyId: v.id("agencies"),
    name: v.string(),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { agencyId, name, contactEmail, notes }) => {
    const userId = await requireUser(ctx);
    await requireAgencyMember(ctx, agencyId, userId, "member");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("클라이언트 이름이 필요합니다.");
    return ctx.db.insert("agencyClients", {
      agencyId,
      name: trimmed,
      contactEmail,
      notes,
      createdAt: Date.now(),
    });
  },
});

export const setActiveContext = mutation({
  args: {
    agencyId: v.optional(v.id("agencies")),
    clientId: v.optional(v.id("agencyClients")),
  },
  handler: async (ctx, { agencyId, clientId }) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("프로필이 없습니다.");

    if (!agencyId) {
      await ctx.db.patch(profile._id, {
        activeAgencyId: undefined,
        activeClientId: undefined,
      });
      return null;
    }

    await requireAgencyMember(ctx, agencyId, userId);
    if (clientId) {
      const client = await ctx.db.get(clientId);
      if (!client || client.agencyId !== agencyId) {
        throw new Error("클라이언트를 찾을 수 없습니다.");
      }
    }
    await ctx.db.patch(profile._id, {
      activeAgencyId: agencyId,
      activeClientId: clientId,
    });
    return { agencyId, clientId: clientId ?? null };
  },
});

export const listMembers = query({
  args: { agencyId: v.id("agencies") },
  handler: async (ctx, { agencyId }) => {
    const userId = await requireUser(ctx);
    await requireAgencyMember(ctx, agencyId, userId);
    const members = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
      .collect();
    return Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          _id: m._id,
          userId: m.userId,
          role: m.role,
          email: user?.email ?? "",
          name: user?.name ?? "",
        };
      }),
    );
  },
});

export const addMemberByEmail = mutation({
  args: {
    agencyId: v.id("agencies"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { agencyId, email, role }) => {
    const userId = await requireUser(ctx);
    await requireAgencyMember(ctx, agencyId, userId, "admin");
    const normalized = email.trim().toLowerCase();
    const users = await ctx.db.query("users").collect();
    const target = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (!target) throw new Error("해당 이메일로 가입된 사용자가 없습니다. 먼저 로그인하도록 안내하세요.");

    const existing = await ctx.db
      .query("agencyMembers")
      .withIndex("by_agency_user", (q) => q.eq("agencyId", agencyId).eq("userId", target._id))
      .unique();
    if (existing) throw new Error("이미 멤버입니다.");

    return ctx.db.insert("agencyMembers", {
      agencyId,
      userId: target._id,
      role,
    });
  },
});

export const listApiKeys = query({
  args: { agencyId: v.id("agencies") },
  handler: async (ctx, { agencyId }) => {
    const userId = await requireUser(ctx);
    await requireAgencyMember(ctx, agencyId, userId, "admin");
    const keys = await ctx.db
      .query("agencyApiKeys")
      .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
      .collect();
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      revoked: k.revoked,
    }));
  },
});

/** API 키 발급 — 원문은 응답에 1회만 포함. */
export const createApiKey = mutation({
  args: {
    agencyId: v.id("agencies"),
    name: v.string(),
  },
  handler: async (ctx, { agencyId, name }) => {
    const userId = await requireUser(ctx);
    await requireAgencyPlan(ctx, userId);
    await requireAgencyMember(ctx, agencyId, userId, "admin");
    const { raw, prefix } = generateApiKey();
    const keyHash = await sha256Hex(raw);
    const id = await ctx.db.insert("agencyApiKeys", {
      agencyId,
      name: name.trim() || "default",
      keyPrefix: prefix,
      keyHash,
      createdAt: Date.now(),
      revoked: false,
    });
    return { id, apiKey: raw, keyPrefix: prefix };
  },
});

export const revokeApiKey = mutation({
  args: { keyId: v.id("agencyApiKeys") },
  handler: async (ctx, { keyId }) => {
    const userId = await requireUser(ctx);
    const key = await ctx.db.get(keyId);
    if (!key) throw new Error("키를 찾을 수 없습니다.");
    await requireAgencyMember(ctx, key.agencyId, userId, "admin");
    await ctx.db.patch(keyId, { revoked: true });
  },
});

/** HTTP API용 — 키로 에이전시 조회 */
export const resolveByApiKey = internalQuery({
  args: { bearer: v.string() },
  handler: async (ctx, { bearer }) => {
    const token = bearer.trim();
    if (!token.startsWith("cp_live_")) return null;
    const keyHash = await sha256Hex(token);
    const row = await ctx.db
      .query("agencyApiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!row || row.revoked) return null;
    const agency = await ctx.db.get(row.agencyId);
    if (!agency) return null;
    return { agencyId: agency._id, ownerUserId: agency.ownerUserId, name: agency.name };
  },
});

export const listClientsInternal = internalQuery({
  args: { agencyId: v.id("agencies") },
  handler: async (ctx, { agencyId }) => {
    return ctx.db
      .query("agencyClients")
      .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
      .collect();
  },
});

export const createClientInternal = internalMutation({
  args: {
    agencyId: v.id("agencies"),
    name: v.string(),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("agencyClients", {
      agencyId: args.agencyId,
      name: args.name.trim(),
      contactEmail: args.contactEmail,
      createdAt: Date.now(),
    });
  },
});

export const listCampaignsByClientInternal = internalQuery({
  args: { agencyId: v.id("agencies"), clientId: v.optional(v.id("agencyClients")) },
  handler: async (ctx, { agencyId, clientId }) => {
    if (clientId) {
      const client = await ctx.db.get(clientId);
      if (!client || client.agencyId !== agencyId) return [];
      return ctx.db
        .query("campaigns")
        .withIndex("by_client", (q) => q.eq("agencyClientId", clientId))
        .collect();
    }
    const clients = await ctx.db
      .query("agencyClients")
      .withIndex("by_agency", (q) => q.eq("agencyId", agencyId))
      .collect();
    const all = [];
    for (const c of clients) {
      const rows = await ctx.db
        .query("campaigns")
        .withIndex("by_client", (q) => q.eq("agencyClientId", c._id))
        .collect();
      all.push(...rows.map((r) => ({ ...r, clientName: c.name })));
    }
    return all;
  },
});

export const createPressReleaseInternal = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    clientId: v.id("agencyClients"),
    title: v.string(),
    body: v.string(),
    topicTags: v.array(v.string()),
    headlines: v.optional(v.array(v.string())),
    who: v.optional(v.string()),
    numbers: v.optional(v.string()),
    quote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("client not found");
    const prId = await ctx.db.insert("pressReleases", {
      userId: args.ownerUserId,
      title: args.title,
      headlines: args.headlines?.length ? args.headlines : [args.title],
      body: args.body,
      topicTags: args.topicTags,
      who: args.who,
      numbers: args.numbers,
      quote: args.quote,
      status: "ready",
      agencyClientId: args.clientId,
    });
    const campaignId = await ctx.db.insert("campaigns", {
      userId: args.ownerUserId,
      pressReleaseId: prId,
      name: args.title,
      status: "draft",
      agencyClientId: args.clientId,
    });
    return { pressReleaseId: prId, campaignId };
  },
});
