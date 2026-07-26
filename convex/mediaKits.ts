import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model";
// 완성도 산출은 `lib/mediaKitCompleteness`가 정본이다(가중 배점 + 항목별 미충족 사유).
// 여기서는 DB에 저장할 총점만 쓰고, 사유는 화면이 같은 순수 함수를 직접 호출해 얻는다.
import { computeCompleteness } from "./lib/mediaKitCompleteness";

const factItem = v.object({
  label: v.string(),
  value: v.string(),
  source: v.optional(v.string()),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return ctx.db
      .query("mediaKits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("mediaKits") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const k = await ctx.db.get(id);
    if (!k || k.userId !== userId) return null;
    return k;
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    return ctx.db.insert("mediaKits", {
      userId,
      name,
      keyMessages: [],
      factSheet: [],
      quotes: [],
      completeness: 0,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("mediaKits"),
    name: v.optional(v.string()),
    boilerplate: v.optional(v.string()),
    keyMessages: v.optional(v.array(v.string())),
    factSheet: v.optional(v.array(factItem)),
    narrative: v.optional(v.string()),
    spokesperson: v.optional(v.string()),
    quotes: v.optional(v.array(v.string())),
    contact: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUser(ctx);
    const k = await ctx.db.get(id);
    if (!k || k.userId !== userId) throw new Error("권한이 없습니다.");
    const merged = {
      boilerplate: rest.boilerplate ?? k.boilerplate,
      keyMessages: rest.keyMessages ?? k.keyMessages,
      factSheet: rest.factSheet ?? k.factSheet,
      narrative: rest.narrative ?? k.narrative,
      spokesperson: rest.spokesperson ?? k.spokesperson,
      quotes: rest.quotes ?? k.quotes,
      contact: rest.contact ?? k.contact,
    };
    await ctx.db.patch(id, {
      ...(rest.name ? { name: rest.name } : {}),
      ...merged,
      completeness: computeCompleteness(merged),
    });
  },
});
