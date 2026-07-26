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

/** ⑥ 비주얼 자산 — GEO 파일명·Alt·캡션 규칙 대상(`mediaKitCompleteness`가 채점). */
const visualItem = v.object({
  label: v.string(),
  url: v.optional(v.string()),
  alt: v.optional(v.string()),
  caption: v.optional(v.string()),
});

/** ⑨ 자산 사용 규정 4항 — 키 순서는 `pressGuide.ASSET_POLICY_ITEMS`와 대응한다. */
const assetPolicyObject = v.object({
  usageScope: v.optional(v.string()),
  modificationLimits: v.optional(v.string()),
  credit: v.optional(v.string()),
  trademarkContact: v.optional(v.string()),
});

/** ⑦ 최근 보도 — 사용자가 확인한 기사만 담는다(생성 AI가 지어내지 않는다). */
const coverageItem = v.object({
  outlet: v.string(),
  title: v.string(),
  url: v.optional(v.string()),
  publishedAtText: v.optional(v.string()),
});

/**
 * create·update 공통 본문 인자. **전부 optional**이라 기존 호출부(`create({ name })`,
 * 신규 4필드를 모르는 update 호출)가 그대로 동작한다 — 보낸 필드만 덮어쓴다.
 */
const contentArgs = {
  boilerplate: v.optional(v.string()),
  keyMessages: v.optional(v.array(v.string())),
  factSheet: v.optional(v.array(factItem)),
  narrative: v.optional(v.string()),
  spokesperson: v.optional(v.string()),
  quotes: v.optional(v.array(v.string())),
  contact: v.optional(v.string()),
  oneLiner: v.optional(v.string()),
  visuals: v.optional(v.array(visualItem)),
  assetPolicy: v.optional(assetPolicyObject),
  coverage: v.optional(v.array(coverageItem)),
} as const;

/** `undefined` 키를 떨궈 낸다 — insert에 없는 필드로 넣기 위함(optional 스키마 유지). */
function definedFields<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, value]) => value !== undefined)) as Partial<T>;
}

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
  args: { name: v.string(), ...contentArgs },
  handler: async (ctx, { name, ...rest }) => {
    const userId = await requireUser(ctx);
    // 배열 3종만 스키마가 필수로 요구한다 — 나머지는 안 보내면 필드 자체가 없다.
    const content = {
      ...definedFields(rest),
      keyMessages: rest.keyMessages ?? [],
      factSheet: rest.factSheet ?? [],
      quotes: rest.quotes ?? [],
    };
    return ctx.db.insert("mediaKits", {
      userId,
      name,
      ...content,
      completeness: computeCompleteness(content),
    });
  },
});

export const update = mutation({
  args: { id: v.id("mediaKits"), name: v.optional(v.string()), ...contentArgs },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUser(ctx);
    const k = await ctx.db.get(id);
    if (!k || k.userId !== userId) throw new Error("권한이 없습니다.");
    // 보내지 않은 필드는 기존 값을 그대로 승계한다(부분 저장 호출부 보호).
    const merged = {
      boilerplate: rest.boilerplate ?? k.boilerplate,
      keyMessages: rest.keyMessages ?? k.keyMessages,
      factSheet: rest.factSheet ?? k.factSheet,
      narrative: rest.narrative ?? k.narrative,
      spokesperson: rest.spokesperson ?? k.spokesperson,
      quotes: rest.quotes ?? k.quotes,
      contact: rest.contact ?? k.contact,
      oneLiner: rest.oneLiner ?? k.oneLiner,
      visuals: rest.visuals ?? k.visuals,
      assetPolicy: rest.assetPolicy ?? k.assetPolicy,
      coverage: rest.coverage ?? k.coverage,
    };
    await ctx.db.patch(id, {
      ...(rest.name ? { name: rest.name } : {}),
      ...merged,
      completeness: computeCompleteness(merged),
    });
  },
});
