import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./model";

const journalistRow = v.object({
  name: v.string(),
  outlet: v.string(),
  email: v.string(),
  beatPrimary: v.string(),
  beatSecondary: v.array(v.string()),
  contactConfidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  referenceArticleCount: v.number(),
  topReferenceTitle: v.optional(v.string()),
  topReferenceUrl: v.optional(v.string()),
  mailingStatus: v.string(),
  source: v.literal("opencrab"),
});

/** OpenCrab 동기화 결과 업서트(이메일 키). 액션에서만 호출. */
export const upsertFromOpenCrab = internalMutation({
  args: { journalists: v.array(journalistRow) },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, { journalists }) => {
    let inserted = 0;
    let updated = 0;
    for (const j of journalists) {
      const existing = await ctx.db
        .query("journalists")
        .withIndex("by_email", (q) => q.eq("email", j.email))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: j.name,
          outlet: j.outlet,
          beatPrimary: j.beatPrimary,
          beatSecondary: j.beatSecondary,
          contactConfidence: j.contactConfidence,
          referenceArticleCount: j.referenceArticleCount,
          topReferenceTitle: j.topReferenceTitle,
          topReferenceUrl: j.topReferenceUrl,
          mailingStatus: "candidate",
          source: "opencrab",
        });
        updated += 1;
      } else {
        await ctx.db.insert("journalists", {
          ...j,
          mailingStatus: "candidate",
        });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

/** 클라이언트가 OpenCrab 설정 여부를 UI에 표시할 때 사용(키 값은 노출하지 않음). */
export const syncStatus = query({
  args: {},
  returns: v.object({
    journalistCount: v.number(),
    opencrabConfigured: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireUser(ctx);
    const journalists = await ctx.db.query("journalists").collect();
    // 클라이언트에는 설정 여부만 — 실제 키 존재는 액션에서 판단하고,
    // 여기선 opencrab 소스 레코드 유무로 힌트를 준다.
    const fromOpenCrab = journalists.some((j) => j.source === "opencrab");
    return {
      journalistCount: journalists.length,
      opencrabConfigured: fromOpenCrab,
    };
  },
});
