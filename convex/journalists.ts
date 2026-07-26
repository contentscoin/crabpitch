import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, getProfile } from "./model";
import { scoreJournalist } from "./lib/scoring";
import { journalistCode } from "./lib/mask";
import { applyMatchReveal } from "./lib/matchGate";
import { PLAN_LIMITS, type Plan } from "./lib/plans";

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

    // 플랜별 발송 후보 한도 — 초과분은 잠금(included=false). 신뢰도 low는 한도와 무관하게 제외.
    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const { flags, result: gate } = applyMatchReveal(
      scored.map((x) => ({
        score: x.score,
        lowConfidence: x.j.contactConfidence === "low",
      })),
      PLAN_LIMITS[plan].matchReveal,
    );

    // 기존 매칭 초기화 후 재기록
    const old = await ctx.db
      .query("matches")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    await Promise.all(old.map((m) => ctx.db.delete(m._id)));

    await Promise.all(
      scored.map((x, i) =>
        ctx.db.insert("matches", {
          campaignId,
          journalistId: x.j._id,
          score: x.score,
          reason: x.reason,
          included: flags[i],
        }),
      ),
    );

    await ctx.db.patch(campaignId, { status: "matched" });
    return {
      matched: scored.length,
      included: gate.includedCount,
      locked: gate.lockedCount,
      matchReveal: PLAN_LIMITS[plan].matchReveal,
      plan,
    };
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

    // 플랜 한도로 잠긴 후보를 표시하기 위해 동일 규칙을 재적용한다.
    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const journalistDocs = await Promise.all(
      matches.map((m) => ctx.db.get(m.journalistId)),
    );
    const { flags: allowedFlags } = applyMatchReveal(
      matches.map((m, i) => ({
        score: m.score,
        lowConfidence: journalistDocs[i]?.contactConfidence === "low",
      })),
      PLAN_LIMITS[plan].matchReveal,
    );

    return Promise.all(
      matches.map(async (m, idx) => {
        const j = journalistDocs[idx];
        return {
          _id: m._id,
          journalistId: m.journalistId,
          score: m.score,
          reason: m.reason,
          included: m.included,
          /** 플랜 후보 한도로 잠긴 후보 (신뢰도 low 제외와 구분) */
          lockedByPlan: !m.included && !allowedFlags[idx] && j?.contactConfidence !== "low",
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

    // 켜는 방향이면 플랜 후보 한도를 다시 확인한다 (토글로 한도를 우회할 수 없게).
    if (!m.included) {
      const profile = await getProfile(ctx, userId);
      const plan: Plan = (profile?.plan as Plan) ?? "free";
      const limit = PLAN_LIMITS[plan].matchReveal;
      const includedNow = (
        await ctx.db
          .query("matches")
          .withIndex("by_campaign", (q) => q.eq("campaignId", m.campaignId))
          .collect()
      ).filter((x) => x.included).length;
      if (includedNow >= limit) {
        throw new Error(
          `${PLAN_LIMITS[plan].label} 플랜은 발송 후보 ${limit}명까지입니다. 다른 후보를 먼저 해제하거나 플랜을 업그레이드하세요.`,
        );
      }
    }

    await ctx.db.patch(matchId, { included: !m.included });
  },
});
