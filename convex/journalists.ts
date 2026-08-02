import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser, getProfile } from "./model";
import { PLAN_LIMITS, type Plan } from "./lib/plans";
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

/** 팩에서 이 기간 이상 확인되지 않으면 stale로 본다(승인 화면 배지와 같은 기준). */
export const STALE_MATCH_DAYS = 30;
/** 관리자 스위치 키 — platformSettings. */
export const EXCLUDE_STALE_KEY = "excludeStaleMatches";

/** 캠페인 보도자료 주제로 기자 매칭 실행(적합도 점수 + 근거 기록). */
/**
 * 기자 매칭 — **웹앱과 MCP가 공유하는 단일 구현.**
 *
 * `userId`를 인자로 받는다: MCP에는 로그인 세션이 없고 키로 사용자를 찾는다.
 * 경로마다 구현을 따로 두면 억제 리스트·재접근 거부 같은 제외 기준이 한쪽에서만 걸린다.
 */
export async function matchForCampaignForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  { campaignId, topK }: { campaignId: Id<"campaigns">; topK?: number },
): Promise<number> {
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

    // 팩에서 오래 확인되지 않은 레코드(이직·퇴사 추정)를 매칭에서 뺄지 — 관리자 스위치.
    // 완전한 stale 마킹·감점은 2차. 여기서는 "기본 제외" 여부만 다룬다.
    const staleSetting = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", EXCLUDE_STALE_KEY))
      .unique();
    const excludeStale = staleSetting?.boolValue === true;
    const staleBefore = Date.now() - STALE_MATCH_DAYS * 24 * 60 * 60 * 1000;

    // 보류 회신 뒤 사용자가 "다시 접근하지 않음"으로 판단한 기자 — 수신거부(법적 억제)와는
    // 다른 축이며, 사용자가 언제든 다시 켤 수 있다.
    const noReapproach = new Set<string>();
    for (const c of await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      const replies = await ctx.db
        .query("replies")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      for (const r of replies) {
        if (r.reapproachOk === false) noReapproach.add(String(r.journalistId));
      }
    }

    const journalists = (await ctx.db.query("journalists").collect()).filter((j) => {
      if (suppressed.has(j.email)) return false;
      if (noReapproach.has(String(j._id))) return false;
      if (!excludeStale) return true;
      // 팩 유래가 아닌 레코드(seed·manual)는 이 판정 대상이 아니다.
      if (j.source !== "opencrab") return true;
      return j.lastSeenInPackAt !== undefined && j.lastSeenInPackAt >= staleBefore;
    });

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
}

export const matchForCampaign = mutation({
  args: { campaignId: v.id("campaigns"), topK: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return matchForCampaignForUser(ctx, userId, args);
  },
});

/**
 * 매칭 상위에 들지 못한 **나머지 기자 전체**를 같은 캠페인 주제로 점수화해 추천순으로 돌려준다.
 *
 * 매칭은 상한(기본 15명)이 걸려 있어, 디렉터리에 기자가 아무리 많아도 그 위는 보이지 않는다.
 * 매처가 놓친 사람을 사용자가 직접 고를 수 있어야 한다.
 *
 * 노출 인원은 플랜의 `matchReveal`을 따른다 — 무료 3명, 유료 무제한.
 * 이 필드가 원래 "매칭 결과 발송 후보 인원"을 뜻하므로 새 정책을 만들지 않는다.
 *
 * 제외 기준은 매칭과 동일하다(수신거부·재접근 거부·이미 매칭된 기자).
 * 점수 0(주제 무관)도 포함하되 뒤로 민다 — "전체 목록"이 요구사항이기 때문이다.
 */
export const listBeyondMatches = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return null;
    const pr = await ctx.db.get(campaign.pressReleaseId);
    if (!pr) return null;

    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";
    const reveal = PLAN_LIMITS[plan].matchReveal;

    const matchedIds = new Set(
      (
        await ctx.db
          .query("matches")
          .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
          .collect()
      ).map((m) => String(m.journalistId)),
    );

    const suppressed = new Set(
      (
        await ctx.db
          .query("suppressionList")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      ).map((s) => s.email),
    );

    const noReapproach = new Set<string>();
    for (const c of await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      for (const r of await ctx.db
        .query("replies")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect()) {
        if (r.reapproachOk === false) noReapproach.add(String(r.journalistId));
      }
    }

    const rest = (await ctx.db.query("journalists").collect()).filter(
      (j) =>
        !matchedIds.has(String(j._id)) &&
        !suppressed.has(j.email) &&
        !noReapproach.has(String(j._id)),
    );

    const scored = rest
      .map((j) => ({ j, ...scoreJournalist(j, pr.topicTags) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.j.referenceArticleCount - a.j.referenceArticleCount,
      );

    const shown = scored.slice(0, reveal);

    return {
      plan,
      /** 매칭 밖 후보 총수 */
      total: scored.length,
      /** 플랜 한도에 막혀 가려진 수 — 0이면 전부 보인다 */
      lockedCount: Math.max(0, scored.length - shown.length),
      journalists: shown.map((x) => ({
        journalistId: x.j._id,
        code: journalistCode(x.j._id),
        outlet: x.j.outlet,
        beatPrimary: x.j.beatPrimary,
        contactConfidence: x.j.contactConfidence,
        referenceArticleCount: x.j.referenceArticleCount,
        topReferenceTitle: x.j.topReferenceTitle,
        score: x.score,
        reason: x.reason,
      })),
    };
  },
});

/**
 * 매칭 밖 기자를 이 캠페인 후보로 직접 추가한다.
 *
 * 목록만 보여주고 끝내면 사용자는 본 사람을 쓸 수 없다. 추가 시점에도 매칭과 **같은
 * 제외 기준**을 다시 확인한다 — 목록을 띄운 뒤 수신거부가 들어왔을 수 있다.
 */
export const addToMatches = mutation({
  args: { campaignId: v.id("campaigns"), journalistId: v.id("journalists") },
  handler: async (ctx, { campaignId, journalistId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const pr = await ctx.db.get(campaign.pressReleaseId);
    if (!pr) throw new Error("보도자료를 찾을 수 없습니다.");
    const j = await ctx.db.get(journalistId);
    if (!j) throw new Error("기자를 찾을 수 없습니다.");

    const existing = await ctx.db
      .query("matches")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    if (existing.some((m) => m.journalistId === journalistId)) {
      throw new Error("이미 이 캠페인의 후보입니다.");
    }

    // 목록 조회 후 수신거부가 들어왔을 수 있으므로 발송 전 마지막으로 다시 본다.
    const suppressed = await ctx.db
      .query("suppressionList")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (suppressed.some((sup) => sup.email === j.email)) {
      throw new Error("수신거부한 기자입니다. 후보로 추가할 수 없습니다.");
    }

    const { score, reason } = scoreJournalist(j, pr.topicTags);
    await ctx.db.insert("matches", {
      campaignId,
      journalistId,
      score,
      reason,
      // 사용자가 직접 고른 기자다 — 매칭 결과와 달리 기본 포함으로 둔다.
      included: true,
    });
    return null;
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

    const now = Date.now();
    return Promise.all(
      matches.map(async (m, idx) => {
        const j = await ctx.db.get(m.journalistId);
        // 팩에서 마지막으로 확인된 지 며칠 지났는지 — 이직·퇴사로 팩에서 사라진 기자의
        // 낡은 이메일로 발송되는 걸 사용자가 알아채게 하는 신호(집계값이라 PII 무관).
        const packAgeDays =
          j?.lastSeenInPackAt !== undefined
            ? Math.floor((now - j.lastSeenInPackAt) / (24 * 60 * 60 * 1000))
            : undefined;
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
          outletCategory: j?.outletCategory,
          packAgeDays,
          // 템플릿 미리보기가 실제 초안과 **같은 문장**을 렌더하려면 후킹·앵글 분기에
          // 쓰이는 컨텍스트가 필요하다. 없으면 미리보기가 실제와 다른 문장을 보여 주고,
          // 그건 미리보기가 없는 것보다 나쁘다. (실명·이메일은 포함하지 않는다.)
          beatSecondary: j?.beatSecondary,
          beatDistribution: j?.beatDistribution,
          referenceArticles: j?.referenceArticles,
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
