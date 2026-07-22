import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model";
import { scoreJournalist } from "./lib/scoring";
import { journalistCode } from "./lib/mask";

/**
 * 기자 디렉터리.
 * ⚠️ PII 보호: 실명·이메일·연락처는 클라이언트로 절대 내려보내지 않는다.
 *    익명 코드(기자 #XXXX) + 매체 + beat + 신뢰도만 노출한다.
 */
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireUser(ctx);
    let journalists = await ctx.db.query("journalists").collect();
    if (search) {
      const s = search.toLowerCase();
      // 검색은 매체/beat 기준 (실명은 노출하지 않으므로 표시에 쓰지 않음)
      journalists = journalists.filter(
        (j) => j.outlet.toLowerCase().includes(s) || j.beatPrimary.toLowerCase().includes(s),
      );
    }
    journalists.sort((a, b) => b.referenceArticleCount - a.referenceArticleCount);
    return journalists.map((j) => ({
      _id: j._id,
      code: journalistCode(j._id),
      outlet: j.outlet,
      beatPrimary: j.beatPrimary,
      beatSecondary: j.beatSecondary,
      contactConfidence: j.contactConfidence,
      referenceArticleCount: j.referenceArticleCount,
      topReferenceTitle: j.topReferenceTitle,
    }));
  },
});

/** 캠페인 보도자료 주제로 기자 매칭 실행(적합도 점수 + 근거 기록). */
export const matchForCampaign = mutation({
  args: { campaignId: v.id("campaigns"), topK: v.optional(v.number()) },
  handler: async (ctx, { campaignId, topK }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const pr = await ctx.db.get(campaign.pressReleaseId);
    if (!pr) throw new Error("보도자료를 찾을 수 없습니다.");

    // 억제 리스트(수신거부) 제외
    const suppressed = new Set(
      (
        await ctx.db
          .query("suppressionList")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      ).map((s) => s.email),
    );

    const journalists = (await ctx.db.query("journalists").collect()).filter(
      (j) => !suppressed.has(j.email),
    );

    const scored = journalists
      .map((j) => ({ j, ...scoreJournalist(j, pr.topicTags) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK ?? 15);

    // 기존 매칭 초기화 후 재기록
    const old = await ctx.db
      .query("matches")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    await Promise.all(old.map((m) => ctx.db.delete(m._id)));

    await Promise.all(
      scored.map((x) =>
        ctx.db.insert("matches", {
          campaignId,
          journalistId: x.j._id,
          score: x.score,
          reason: x.reason,
          included: x.j.contactConfidence !== "low", // low 신뢰도는 기본 제외
        }),
      ),
    );

    await ctx.db.patch(campaignId, { status: "matched" });
    return scored.length;
  },
});

/** 캠페인 매칭 결과 — 실명·이메일 없이 익명 코드 + 매체 + 적합도만. */
export const listMatches = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return [];

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    matches.sort((a, b) => b.score - a.score);

    return Promise.all(
      matches.map(async (m, idx) => {
        const j = await ctx.db.get(m.journalistId);
        return {
          _id: m._id,
          journalistId: m.journalistId,
          score: m.score,
          reason: m.reason,
          included: m.included,
          rank: idx + 1,
          code: journalistCode(m.journalistId),
          outlet: j?.outlet ?? "?",
          beatPrimary: j?.beatPrimary ?? "",
          contactConfidence: j?.contactConfidence ?? "low",
          topReferenceTitle: j?.topReferenceTitle,
        };
      }),
    );
  },
});

export const toggleInclude = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const userId = await requireUser(ctx);
    const m = await ctx.db.get(matchId);
    if (!m) throw new Error("매칭을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(m.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    await ctx.db.patch(matchId, { included: !m.included });
  },
});
