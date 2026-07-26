import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getProfile, requireUser } from "./model";
import { planAllowsMcp, type Plan } from "./lib/plans";
import {
  buildUserMcpSnippet,
  generateMcpKey,
  requireMcpPlan,
} from "./lib/mcpAuth";
import { sha256Hex } from "./lib/agencyAuth";
import { mcpSiteBase } from "./lib/mcpHttpAuth";

function siteBase(): string {
  return mcpSiteBase();
}

/** 1인당 활성 연결 키 상한 — 남용·키 방치 방지. */
export const MAX_ACTIVE_MCP_KEYS = 4;

export const getAccess = query({
  args: {},
  returns: v.object({
    allowed: v.boolean(),
    plan: v.string(),
    siteUrl: v.string(),
    message: v.string(),
    maxKeys: v.number(),
    activeKeyCount: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    const plan = (profile?.plan as Plan) ?? "free";
    const allowed = planAllowsMcp(plan);
    const keys = await ctx.db
      .query("userMcpKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      allowed,
      plan,
      siteUrl: siteBase(),
      message: allowed
        ? "연결 키를 만들어 Claude·ChatGPT·Gemini·Cursor에 붙일 수 있습니다."
        : "내 AI 연결은 Solo / Growth / Agency에서 사용할 수 있습니다. 설정에서 플랜을 바꿔 주세요.",
      maxKeys: MAX_ACTIVE_MCP_KEYS,
      activeKeyCount: keys.filter((k) => !k.revoked).length,
    };
  },
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("userMcpKeys"),
      name: v.string(),
      keyPrefix: v.string(),
      createdAt: v.number(),
      lastUsedAt: v.union(v.number(), v.null()),
      revoked: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const keys = await ctx.db
      .query("userMcpKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt ?? null,
      revoked: k.revoked,
    }));
  },
});

/** 원문은 응답에 1회만 포함. */
export const create = mutation({
  args: { name: v.string() },
  returns: v.object({
    id: v.id("userMcpKeys"),
    apiKey: v.string(),
    keyPrefix: v.string(),
    mcpSnippet: v.string(),
    mcpUrl: v.string(),
  }),
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    await requireMcpPlan(ctx, userId);

    const existing = await ctx.db
      .query("userMcpKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const activeCount = existing.filter((k) => !k.revoked).length;
    if (activeCount >= MAX_ACTIVE_MCP_KEYS) {
      throw new Error(
        `연결 키는 1인당 최대 ${MAX_ACTIVE_MCP_KEYS}개입니다. 안 쓰는 키를 「연결 끊기」로 폐기한 뒤 다시 만드세요.`,
      );
    }

    const { raw, prefix } = generateMcpKey();
    const keyHash = await sha256Hex(raw);
    const id = await ctx.db.insert("userMcpKeys", {
      userId,
      name: name.trim() || "default",
      keyPrefix: prefix,
      keyHash,
      createdAt: Date.now(),
      revoked: false,
    });
    const mcpUrl = `${siteBase()}/api/mcp/${raw}`;
    return {
      id,
      apiKey: raw,
      keyPrefix: prefix,
      mcpUrl,
      mcpSnippet: buildUserMcpSnippet(siteBase(), raw),
    };
  },
});

export const revoke = mutation({
  args: { keyId: v.id("userMcpKeys") },
  returns: v.null(),
  handler: async (ctx, { keyId }) => {
    const userId = await requireUser(ctx);
    const key = await ctx.db.get(keyId);
    if (!key || key.userId !== userId) throw new Error("키를 찾을 수 없습니다.");
    await ctx.db.patch(keyId, { revoked: true });
    return null;
  },
});
