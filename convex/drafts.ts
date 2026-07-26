import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser, getProfile, bumpSends } from "./model";
import { buildEmailDraft } from "./lib/emailTemplate";
import { journalistCode } from "./lib/mask";
import { PLAN_LIMITS, currentMonth, type Plan } from "./lib/plans";
import { partitionBySuppression, suppressedEmailSet } from "./lib/sendGuard";
import { COOLDOWN_DAYS, partitionByCooldown } from "./lib/cooldown";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * 이 사용자가 해당 기자에게 마지막으로 발송한 시각. (없으면 null)
 * emailDrafts.userId 는 비정규화 필드 — 없는 레거시 행은 campaign 을 거쳐 확인한다.
 */
async function lastSentAtForJournalist(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  journalistId: Id<"journalists">,
): Promise<number | null> {
  const rows = await ctx.db
    .query("emailDrafts")
    .withIndex("by_user_journalist", (q) =>
      q.eq("userId", userId).eq("journalistId", journalistId),
    )
    .collect();
  let last: number | null = null;
  for (const r of rows) {
    if (r.status !== "sent" && r.status !== "published") continue;
    if (r.sentAt != null && (last == null || r.sentAt > last)) last = r.sentAt;
  }
  return last;
}

/** 7일 쿨다운 대상 제외. 차단분은 발송하지 않고 초안으로 남긴다. */
async function filterCooldown(
  ctx: MutationCtx,
  userId: Id<"users">,
  drafts: Array<Doc<"emailDrafts">>,
  now: number,
): Promise<{ sendable: Array<Doc<"emailDrafts">>; blocked: number }> {
  const withLast = [];
  for (const d of drafts) {
    withLast.push({
      draft: d,
      lastSentAt: await lastSentAtForJournalist(ctx, userId, d.journalistId),
    });
  }
  const { sendable, blocked } = partitionByCooldown(
    withLast,
    (x) => x.lastSentAt,
    now,
  );
  return { sendable: sendable.map((x) => x.draft), blocked: blocked.length };
}

/**
 * 발송 직전 억제 리스트 재대조 — 초안 생성 후 수신거부한 기자를 제외한다.
 * (매칭 시점 필터만으로는 예약 발송처럼 시차가 있는 경로에서 샌다.)
 */
async function filterSuppressed(
  ctx: MutationCtx,
  userId: Id<"users">,
  drafts: Array<Doc<"emailDrafts">>,
): Promise<{ sendable: Array<Doc<"emailDrafts">>; blocked: number }> {
  const rows = await ctx.db
    .query("suppressionList")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (rows.length === 0) return { sendable: drafts, blocked: 0 };

  const suppressed = suppressedEmailSet(rows.map((r) => r.email));
  const withEmail = [];
  for (const d of drafts) {
    const j = await ctx.db.get(d.journalistId);
    withEmail.push({ draft: d, email: j?.email ?? "" });
  }
  const { sendable, blocked } = partitionBySuppression(withEmail, suppressed);
  return { sendable: sendable.map((x) => x.draft), blocked: blocked.length };
}

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

    const now = Date.now();
    let created = 0;
    let skippedCooldown = 0;
    for (const m of matches) {
      const j = await ctx.db.get(m.journalistId);
      if (!j) continue;
      // 7일 재발송 쿨다운: 초안 자체를 만들지 않는다(승인 화면에 올라오지 않게).
      const lastSentAt = await lastSentAtForJournalist(ctx, userId, j._id);
      if (lastSentAt != null && now - lastSentAt < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
        skippedCooldown += 1;
        continue;
      }
      // ⚠️ 초안 본문에 기자 실명을 넣지 않는다("기자님"). 실명은 발송 시점(Gmail)에만 주입.
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
          beatPrimary: j.beatPrimary,
          topReferenceTitle: j.topReferenceTitle,
        },
      );
      await ctx.db.insert("emailDrafts", {
        campaignId,
        userId,
        journalistId: j._id,
        subject,
        body,
        status: "draft",
      });
      created += 1;
    }

    await ctx.db.patch(campaignId, { status: "review" });
    return { created, skippedCooldown };
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
          code: journalistCode(d.journalistId),
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

    const queued = (
      await ctx.db
        .query("emailDrafts")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect()
    ).filter((d) => d.status === "draft" || d.status === "queued");

    // 발송 직전 수신거부 + 7일 쿨다운 재대조 (차단분은 초안으로 남기고 한도에서도 제외)
    const { sendable: notSuppressed } = await filterSuppressed(ctx, userId, queued);
    const { sendable: pending } = await filterCooldown(
      ctx,
      userId,
      notSuppressed,
      Date.now(),
    );

    if (pending.length > remaining) {
      throw new Error(
        `발송 한도 초과: 이번 달 잔여 ${remaining}통, 요청 ${pending.length}통. 플랜 업그레이드 또는 수신자 축소가 필요합니다.`,
      );
    }

    const now = Date.now();
    for (const d of pending) {
      // userId 를 함께 기록해야 이후 7일 쿨다운 조회(by_user_journalist)에 잡힌다.
      await ctx.db.patch(d._id, { status: "sent", sentAt: now, userId });
    }
    await bumpSends(ctx, userId, pending.length);
    await ctx.db.patch(campaignId, { status: "sent", scheduledSendAt: undefined });
    return pending.length;
  },
});

/**
 * 예약 발송 — 승인 게이트 후 미래 시각에 발송 기록(또는 Gmail 초안) 실행.
 * Convex scheduler.runAt 으로 정확히 한 번 실행 + cron 백업.
 */
export const scheduleCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    scheduledSendAt: v.number(),
  },
  handler: async (ctx, { campaignId, scheduledSendAt }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");

    const now = Date.now();
    if (scheduledSendAt <= now + 30_000) {
      throw new Error("예약 시각은 최소 1분 뒤로 설정하세요. 즉시 발송은 ‘발송 기록’을 사용하세요.");
    }

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

    if (pending.length === 0) throw new Error("예약할 초안이 없습니다.");
    if (pending.length > remaining) {
      throw new Error(
        `발송 한도 초과: 이번 달 잔여 ${remaining}통, 요청 ${pending.length}통.`,
      );
    }

    for (const d of pending) {
      await ctx.db.patch(d._id, { status: "queued", scheduledSendAt });
    }
    await ctx.db.patch(campaignId, { status: "sending", scheduledSendAt });

    await ctx.scheduler.runAt(scheduledSendAt, internal.drafts.executeScheduledSend, {
      campaignId,
      userId,
    });

    return { count: pending.length, scheduledSendAt };
  },
});

/** scheduler / cron 에서 호출 — queued 초안을 sent 로 확정. */
export const executeScheduledSend = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
  },
  handler: async (ctx, { campaignId, userId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return 0;
    if (campaign.status === "sent" || campaign.status === "done") return 0;

    const queued = (
      await ctx.db
        .query("emailDrafts")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect()
    ).filter((d) => d.status === "queued" || d.status === "draft");

    // 예약 시점 ~ 실행 시점 사이에 수신거부했거나 7일 쿨다운에 걸린 기자를 제외한다
    // (창이 가장 넓은 경로 — 예약은 며칠 뒤 실행된다)
    const { sendable: notSuppressed } = await filterSuppressed(ctx, userId, queued);
    const { sendable: pending } = await filterCooldown(
      ctx,
      userId,
      notSuppressed,
      Date.now(),
    );

    if (pending.length === 0) {
      await ctx.db.patch(campaignId, { status: "sent", scheduledSendAt: undefined });
      return 0;
    }

    const now = Date.now();
    for (const d of pending) {
      await ctx.db.patch(d._id, {
        status: "sent",
        sentAt: now,
        scheduledSendAt: undefined,
        userId,
      });
    }
    await bumpSends(ctx, userId, pending.length);
    await ctx.db.patch(campaignId, { status: "sent", scheduledSendAt: undefined });
    return pending.length;
  },
});

/** cron 백업: 기한 지난 queued 캠페인 일괄 처리. */
export const processDueSends = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const campaigns = await ctx.db.query("campaigns").collect();
    let processed = 0;
    for (const c of campaigns) {
      if (c.status !== "sending" || !c.scheduledSendAt || c.scheduledSendAt > now) continue;

      const pending = (
        await ctx.db
          .query("emailDrafts")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect()
      ).filter((d) => d.status === "queued" || d.status === "draft");

      if (pending.length === 0) {
        await ctx.db.patch(c._id, { status: "sent", scheduledSendAt: undefined });
        continue;
      }

      for (const d of pending) {
        await ctx.db.patch(d._id, {
          status: "sent",
          sentAt: now,
          scheduledSendAt: undefined,
        });
      }
      await bumpSends(ctx, c.userId, pending.length);
      await ctx.db.patch(c._id, { status: "sent", scheduledSendAt: undefined });
      processed += pending.length;
    }
    return processed;
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

/** AI 개인화용: 캠페인 초안 + 컨텍스트 (실명 미포함). */
export const listDraftsForEnhance = internalQuery({
  args: { campaignId: v.id("campaigns"), userId: v.id("users") },
  returns: v.union(
    v.object({
      companyName: v.string(),
      senderName: v.string(),
      headline: v.string(),
      drafts: v.array(
        v.object({
          draftId: v.id("emailDrafts"),
          subject: v.string(),
          body: v.string(),
          beatPrimary: v.string(),
          topReferenceTitle: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { campaignId, userId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return null;
    const pr = await ctx.db.get(campaign.pressReleaseId);
    if (!pr) return null;
    const profile = await getProfile(ctx, userId);
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    const rows = [];
    for (const d of drafts) {
      if (d.status !== "draft" && d.status !== "queued") continue;
      const j = await ctx.db.get(d.journalistId);
      if (!j) continue;
      rows.push({
        draftId: d._id,
        subject: d.subject,
        body: d.body,
        beatPrimary: j.beatPrimary,
        topReferenceTitle: j.topReferenceTitle,
      });
    }
    return {
      companyName: profile?.companyName ?? pr.who ?? "회사",
      senderName: profile?.senderName ?? "담당자",
      headline: pr.headlines[0] ?? pr.title,
      drafts: rows,
    };
  },
});

export const applyEnhancedDrafts = internalMutation({
  args: {
    updates: v.array(
      v.object({
        draftId: v.id("emailDrafts"),
        subject: v.string(),
        body: v.string(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) {
      await ctx.db.patch(u.draftId, { subject: u.subject, body: u.body });
    }
    return updates.length;
  },
});

/**
 * 레거시 초안 backfill — `userId` 비정규화 필드가 없는 행을 campaign 소유자로 채운다.
 * 7일 재발송 쿨다운(by_user_journalist)이 과거 발송 기록까지 보게 하려면 1회 실행 필요.
 *   npx convex run drafts:backfillDraftUserIds '{}' --prod
 */
export const backfillDraftUserIds = internalMutation({
  args: {},
  returns: v.object({ scanned: v.number(), patched: v.number() }),
  handler: async (ctx) => {
    const all = await ctx.db.query("emailDrafts").collect();
    let patched = 0;
    for (const d of all) {
      if (d.userId) continue;
      const campaign = await ctx.db.get(d.campaignId);
      if (!campaign) continue;
      await ctx.db.patch(d._id, { userId: campaign.userId });
      patched += 1;
    }
    return { scanned: all.length, patched };
  },
});
