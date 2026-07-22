import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, getProfile } from "./model";
import { scoreJournalist } from "./lib/scoring";
import { maskEmail } from "./lib/mask";
import { PLAN_LIMITS, type Plan } from "./lib/plans";

/** 기자 디렉터리 — 무료 플랜은 이메일 블러(업셀). */
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const reveal = plan === "free";
    let journalists = await ctx.db.query("journalists").collect();
    if (search) {
      const s = search.toLowerCase();
      journalists = journalists.filter(
        (j) =>
          j.name.toLowerCase().includes(s) ||
          j.outlet.toLowerCase().includes(s) ||
          j.beatPrimary.toLowerCase().includes(s),
      );
    }
    journalists.sort((a, b) => b.referenceArticleCount - a.referenceArticleCount);
    return journalists.map((j) => ({
      ...j,
      email: reveal ? maskEmail(j.email) : j.email,
      emailMasked: reveal,
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

/** 캠페인 매칭 결과 — 무료 플랜은 상위 N명만 이메일 공개. */
export const listMatches = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return [];
    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const revealLimit = PLAN_LIMITS[plan].matchReveal;

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    matches.sort((a, b) => b.score - a.score);

    return Promise.all(
      matches.map(async (m, idx) => {
        const j = await ctx.db.get(m.journalistId);
        const masked = idx >= revealLimit;
        return {
          _id: m._id,
          journalistId: m.journalistId,
          score: m.score,
          reason: m.reason,
          included: m.included,
          rank: idx + 1,
          name: j?.name ?? "?",
          outlet: j?.outlet ?? "?",
          beatPrimary: j?.beatPrimary ?? "",
          contactConfidence: j?.contactConfidence ?? "low",
          email: j ? (masked ? maskEmail(j.email) : j.email) : "",
          emailMasked: masked,
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
