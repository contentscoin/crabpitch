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

export const getAccess = query({
  args: {},
  returns: v.object({
    allowed: v.boolean(),
    plan: v.string(),
    siteUrl: v.string(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    const plan = (profile?.plan as Plan) ?? "free";
    const allowed = planAllowsMcp(plan);
    return {
      allowed,
      plan,
      siteUrl: siteBase(),
      message: allowed
        ? "MCP 키를 발급해 Claude·ChatGPT·Gemini·Cursor에 등록할 수 있습니다."
        : "MCP는 유료 플랜(Solo/Growth/Agency) 전용입니다. 설정에서 플랜을 바꾸세요.",
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
