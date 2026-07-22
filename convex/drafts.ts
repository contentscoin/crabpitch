import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, getProfile, bumpSends } from "./model";
import { buildEmailDraft } from "./lib/emailTemplate";
import { PLAN_LIMITS, currentMonth, type Plan } from "./lib/plans";

/** 포함된 매칭 기자 각각에 개인화 메일 초안 생성. */
export const generateForCampaign = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const pr = await ctx.db.get(campaign.pressReleaseId);
    if (!pr) throw new Error("보도자료를 찾을 수 없습니다.");
    const profile = await getProfile(ctx, userId);

    const matches = (
      await ctx.db
        .query("matches")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect()
    ).filter((m) => m.included);

    // 기존 초안 초기화
    const old = await ctx.db
      .query("emailDrafts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    await Promise.all(old.map((d) => ctx.db.delete(d._id)));

    let created = 0;
    for (const m of matches) {
      const j = await ctx.db.get(m.journalistId);
      if (!j) continue;
      const lastName = j.name.slice(0, 1); // 성(첫 글자)
      const { subject, body } = buildEmailDraft(
        {
          companyName: profile?.companyName ?? pr.who ?? "회사",
          senderName: profile?.senderName ?? "담당자",
          headline: pr.headlines[0] ?? pr.title,
          bodyFact: pr.numbers ?? pr.body.slice(0, 80),
          quote: pr.quote,
          links: pr.links,
          contact: profile?.contactEmail,
        },
        {
          lastName,
          beatPrimary: j.beatPrimary,
          topReferenceTitle: j.topReferenceTitle,
        },
      );
      await ctx.db.insert("emailDrafts", {
        campaignId,
        journalistId: j._id,
        subject,
        body,
        status: "draft",
      });
      created += 1;
    }

    await ctx.db.patch(campaignId, { status: "review" });
    return created;
  },
});

export const listByCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return [];
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    return Promise.all(
      drafts.map(async (d) => {
        const j = await ctx.db.get(d.journalistId);
        const match = await ctx.db
          .query("matches")
          .withIndex("by_campaign_journalist", (q) =>
            q.eq("campaignId", campaignId).eq("journalistId", d.journalistId),
          )
          .unique();
        return {
          ...d,
          name: j?.name ?? "?",
          outlet: j?.outlet ?? "?",
          score: match?.score ?? 0,
        };
      }),
    ).then((rows) => rows.sort((a, b) => b.score - a.score));
  },
});

/**
 * 캠페인 발송 기록 — 컴플라이언스: 승인 게이트 통과 후 호출.
 * 이 패키지는 자동 발송 도구가 없으므로 "발송됨" 상태로 기록(사용자가 Gmail에서 실제 발송).
 * 무료/유료 월 발송 한도를 강제한다.
 */
export const sendCampaign = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const profile = await getProfile(ctx, userId);
    const plan: Plan = (profile?.plan as Plan) ?? "free";

    const month = currentMonth();
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
      .unique();
    const used = usage?.sendsUsed ?? 0;
    const remaining = PLAN_LIMITS[plan].sends - used;

    const pending = (
      await ctx.db
        .query("emailDrafts")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect()
    ).filter((d) => d.status === "draft" || d.status === "queued");

    if (pending.length > remaining) {
      throw new Error(
        `발송 한도 초과: 이번 달 잔여 ${remaining}통, 요청 ${pending.length}통. 플랜 업그레이드 또는 수신자 축소가 필요합니다.`,
      );
    }

    const now = Date.now();
    for (const d of pending) {
      await ctx.db.patch(d._id, { status: "sent", sentAt: now });
    }
    await bumpSends(ctx, userId, pending.length);
    await ctx.db.patch(campaignId, { status: "sent" });
    return pending.length;
  },
});

/** 게재 확인 표시(성과 추적). */
export const markPublished = mutation({
  args: { draftId: v.id("emailDrafts") },
  handler: async (ctx, { draftId }) => {
    const userId = await requireUser(ctx);
    const d = await ctx.db.get(draftId);
    if (!d) throw new Error("초안을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(d.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    await ctx.db.patch(draftId, { status: "published" });
  },
});
