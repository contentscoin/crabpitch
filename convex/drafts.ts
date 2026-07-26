import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser, getProfile, bumpSends } from "./model";
import {
  buildEmailDraftWithPreset,
  renderCustomTemplate,
  type JournalistContext,
} from "./lib/emailTemplate";

const emailTemplatePresetValidator = v.union(
  v.literal("standard"),
  v.literal("data"),
  v.literal("story"),
  v.literal("brief"),
);
import { journalistCode } from "./lib/mask";
import { PLAN_LIMITS, currentMonth, type Plan } from "./lib/plans";
import {
  cooldownReason,
  partitionByCooldown,
  partitionBySuppression,
  suppressedEmailSet,
} from "./lib/sendGuard";
import { checkEmailCompliance } from "./lib/emailCompliance";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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

/* ── 발송 확정 공통 경로 ─────────────────────────────────────
 * 즉시(sendCampaign) · 예약(executeScheduledSend) · 크론 백업(processDueSends)이
 * **모두 이 함수를 통과**한다. 경로마다 게이트를 따로 두면 하나가 반드시 샌다
 * (실제로 processDueSends가 수신거부 재대조를 빠뜨리고 있었다).
 */

/**
 * 이 사용자가 해당 기자에게 마지막으로 발송한 시각.
 *
 * ⚠️ 스코프는 사용자 단위다 — `by_user_journalist` 인덱스로 **자기 초안만** 본다.
 *    교차 사용자 발송 이력은 판정에도, 표시에도 쓰지 않는다.
 * ⚠️ `userId`는 이번 릴리스부터 기록된다. 그 이전에 발송된 초안은 userId가 없어
 *    이 조회에 잡히지 않는다(쿨다운은 이번 릴리스 이후 이력부터 완전해진다).
 *    발송을 확정할 때 userId를 함께 채워 이력이 쌓이도록 한다.
 */
async function lastSentAtForJournalist(
  ctx: MutationCtx,
  userId: Id<"users">,
  journalistId: Id<"journalists">,
): Promise<number | undefined> {
  const rows = await ctx.db
    .query("emailDrafts")
    .withIndex("by_user_journalist", (q) =>
      q.eq("userId", userId).eq("journalistId", journalistId),
    )
    .collect();
  let max: number | undefined;
  for (const r of rows) {
    if (r.status !== "sent" && r.status !== "published") continue;
    if (r.sentAt === undefined) continue;
    if (max === undefined || r.sentAt > max) max = r.sentAt;
  }
  return max;
}

export interface FinalizeSendResult {
  sent: number;
  blockedSuppressed: number;
  blockedCooldown: number;
  blockedCompliance: number;
  /** 캠페인당 상한을 넘겨 이번 회차에 나가지 않은 초안 수 */
  overCap: number;
  /** 월 한도를 넘겨 나가지 않은 초안 수 */
  overMonthly: number;
}

/**
 * 발송 확정 — suppression 재대조 → 쿨다운 → 컴플라이언스 critical 차단 →
 * 캠페인당 상한 → 월 한도 순으로 거르고 통과분만 sent로 확정한다.
 * 제외된 초안은 **삭제하지 않고** 사유(`complianceNotes`)를 남긴 채 초안으로 유지한다.
 */
async function finalizeCampaignSend(
  ctx: MutationCtx,
  campaignId: Id<"campaigns">,
  userId: Id<"users">,
): Promise<FinalizeSendResult> {
  const result: FinalizeSendResult = {
    sent: 0,
    blockedSuppressed: 0,
    blockedCooldown: 0,
    blockedCompliance: 0,
    overCap: 0,
    overMonthly: 0,
  };

  const all = await ctx.db
    .query("emailDrafts")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
    .collect();
  const queued = all.filter((d) => d.status === "draft" || d.status === "queued");
  if (queued.length === 0) {
    // 보낼 게 없으면 예약만 해제한다. 이미 나간 게 있으면 발송 완료로 정리한다.
    const anySent = all.some((d) => d.status === "sent" || d.status === "published");
    await ctx.db.patch(campaignId, {
      ...(anySent ? { status: "sent" as const } : {}),
      scheduledSendAt: undefined,
    });
    return result;
  }

  // ① 수신거부 재대조
  const { sendable: notSuppressed, blocked: suppressedCount } = await filterSuppressed(
    ctx,
    userId,
    queued,
  );
  result.blockedSuppressed = suppressedCount;

  // ② 7일 쿨다운 (사용자 단위)
  const withHistory = [];
  for (const d of notSuppressed) {
    withHistory.push({
      draft: d,
      lastSentAt: await lastSentAtForJournalist(ctx, userId, d.journalistId),
    });
  }
  const now = Date.now();
  const { sendable: offCooldown, blocked: onCooldown } = partitionByCooldown(withHistory, now);
  result.blockedCooldown = onCooldown.length;
  for (const b of onCooldown) {
    await ctx.db.patch(b.draft._id, {
      complianceLevel: "blocked",
      complianceNotes: [cooldownReason(b.daysRemaining)],
    });
  }

  // ③ 컴플라이언스 게이트 — critical 1건이면 차단
  const compliant: Array<Doc<"emailDrafts">> = [];
  for (const { draft } of offCooldown) {
    const check = checkEmailCompliance(draft.subject, draft.body);
    if (check.status === "fail") {
      result.blockedCompliance += 1;
      await ctx.db.patch(draft._id, {
        complianceLevel: "fail",
        complianceNotes: check.notes,
      });
      continue;
    }
    await ctx.db.patch(draft._id, {
      complianceLevel: check.status,
      complianceNotes: check.notes.length ? check.notes : undefined,
    });
    compliant.push(draft);
  }

  // ④ 캠페인당 통수 상한 (월 한도와 별개)
  const profile = await getProfile(ctx, userId);
  const plan: Plan = (profile?.plan as Plan) ?? "free";
  const cap = PLAN_LIMITS[plan].campaignSendCap;
  const alreadySent = all.filter((d) => d.status === "sent" || d.status === "published").length;
  const capRoom = Math.max(0, cap - alreadySent);
  let allowed = compliant.slice(0, capRoom);
  result.overCap = compliant.length - allowed.length;

  // ⑤ 월 발송 한도
  const month = currentMonth();
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();
  const monthlyRoom = Math.max(0, PLAN_LIMITS[plan].sends - (usage?.sendsUsed ?? 0));
  if (allowed.length > monthlyRoom) {
    result.overMonthly = allowed.length - monthlyRoom;
    allowed = allowed.slice(0, monthlyRoom);
  }

  for (const d of allowed) {
    await ctx.db.patch(d._id, {
      status: "sent",
      sentAt: now,
      scheduledSendAt: undefined,
      // 쿨다운 판정 축을 채운다(레거시 초안 백필 겸용)
      userId,
    });
  }
  if (allowed.length > 0) await bumpSends(ctx, userId, allowed.length);
  result.sent = allowed.length;

  // 예약 시각은 결과와 무관하게 지운다 — 남겨 두면 크론 백업이 매분 같은 캠페인을
  // 다시 집어 무한 재시도한다.
  // 한 통도 못 나갔으면 "발송 완료"로 두지 않고 승인 단계로 되돌린다. 사용자가 사유를
  // 확인하고 초안을 고쳐 다시 보낼 수 있어야 한다.
  await ctx.db.patch(campaignId, {
    status: allowed.length > 0 ? "sent" : "review",
    scheduledSendAt: undefined,
  });
  return result;
}

/** 포함된 매칭 기자 각각에 개인화 메일 초안 생성. 템플릿(프리셋/커스텀) 선택 가능. */
export const generateForCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    preset: v.optional(emailTemplatePresetValidator),
    customTemplateId: v.optional(v.id("userEmailTemplates")),
  },
  handler: async (ctx, { campaignId, preset, customTemplateId }) => {
    const userId = await requireUser(ctx);
    if (preset && customTemplateId) {
      throw new Error("preset과 customTemplateId는 동시에 지정할 수 없습니다.");
    }
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const pr = await ctx.db.get(campaign.pressReleaseId);
    if (!pr) throw new Error("보도자료를 찾을 수 없습니다.");
    const profile = await getProfile(ctx, userId);

    let custom: { subject: string; body: string } | null = null;
    if (customTemplateId) {
      const tpl = await ctx.db.get(customTemplateId);
      if (!tpl || tpl.userId !== userId) throw new Error("템플릿을 찾을 수 없습니다.");
      custom = { subject: tpl.subject, body: tpl.body };
    }
    const presetId = preset ?? "standard";

    const matches = (
      await ctx.db
        .query("matches")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect()
    ).filter((m) => m.included);

    // 기존 초안 초기화 — 발송 기록(sent/published)은 감사·게재 추적용이므로 보존한다.
    const old = await ctx.db
      .query("emailDrafts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    const removable = old.filter((d) => d.status === "draft" || d.status === "queued");
    await Promise.all(removable.map((d) => ctx.db.delete(d._id)));
    const preserved = new Set(
      old
        .filter((d) => d.status === "sent" || d.status === "published")
        .map((d) => String(d.journalistId)),
    );

    let created = 0;
    for (const m of matches) {
      if (preserved.has(String(m.journalistId))) continue; // 이미 발송된 기자는 재생성하지 않음
      const j = await ctx.db.get(m.journalistId);
      if (!j) continue;
      // ⚠️ 초안 본문에 기자 실명을 넣지 않는다("기자님"). 실명은 발송 시점(Gmail)에만 주입.
      const emailCtx = {
        companyName: profile?.companyName ?? pr.who ?? "회사",
        senderName: profile?.senderName ?? "담당자",
        headline: pr.headlines[0] ?? pr.title,
        bodyFact: pr.numbers ?? pr.body.slice(0, 80),
        quote: pr.quote,
        links: pr.links,
        contact: profile?.contactEmail,
        embargoAt: pr.embargoAt,
        topicTags: pr.topicTags,
      };
      const jCtx = {
        beatPrimary: j.beatPrimary,
        topReferenceTitle: j.topReferenceTitle,
        beatSecondary: j.beatSecondary,
        beatDistribution: j.beatDistribution,
        outletCategory: j.outletCategory as JournalistContext["outletCategory"],
        referenceArticles: j.referenceArticles,
      };
      const { subject, body } = custom
        ? renderCustomTemplate(custom.subject, custom.body, emailCtx, jCtx)
        : buildEmailDraftWithPreset(presetId, emailCtx, jCtx);
      // 생성 시점에 미리 검증해 승인 화면에서 바로 보이게 한다(발송 시 다시 검증한다).
      const check = checkEmailCompliance(subject, body);
      await ctx.db.insert("emailDrafts", {
        campaignId,
        journalistId: j._id,
        userId,
        subject,
        body,
        status: "draft",
        complianceLevel: check.status,
        ...(check.notes.length ? { complianceNotes: check.notes } : {}),
      });
      created += 1;
    }

    // 일부가 이미 발송된 캠페인은 발송 상태를 되돌리지 않는다(감사 추적 보존).
    if (preserved.size === 0) {
      await ctx.db.patch(campaignId, { status: "review" });
    }
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

    // 발송 직전 수신거부 재대조 (차단분은 초안으로 남기고 한도에서도 제외)
    const { sendable: pending } = await filterSuppressed(ctx, userId, queued);

    // 사용자 대면 경로에서는 한도 초과를 조용히 자르지 않고 명확히 알린다.
    if (pending.length > remaining) {
      throw new Error(
        `발송 한도 초과: 이번 달 잔여 ${remaining}통, 요청 ${pending.length}통. 플랜 업그레이드 또는 수신자 축소가 필요합니다.`,
      );
    }
    const cap = PLAN_LIMITS[plan].campaignSendCap;
    if (pending.length > cap) {
      throw new Error(
        `캠페인당 발송 상한(${cap}통)을 초과했습니다. 요청 ${pending.length}통 — 수신자를 나눠 보내세요.`,
      );
    }

    const res = await finalizeCampaignSend(ctx, campaignId, userId);
    return res.sent;
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
    const cap = PLAN_LIMITS[plan].campaignSendCap;
    if (pending.length > cap) {
      throw new Error(
        `캠페인당 발송 상한(${cap}통)을 초과했습니다. 요청 ${pending.length}통 — 수신자를 나눠 예약하세요.`,
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

/**
 * scheduler / cron 에서 호출 — queued 초안을 sent 로 확정.
 * 예약 시점 ~ 실행 시점 사이의 창이 가장 넓은 경로라 게이트가 특히 중요하다.
 */
export const executeScheduledSend = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
  },
  handler: async (ctx, { campaignId, userId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return 0;
    if (campaign.status === "sent" || campaign.status === "done") return 0;

    const res = await finalizeCampaignSend(ctx, campaignId, userId);
    return res.sent;
  },
});

/**
 * cron 백업: 기한 지난 queued 캠페인 일괄 처리.
 *
 * ⚠️ 이 경로는 예전에 수신거부 재대조를 하지 않아 억제된 기자에게 그대로 나갔다.
 *    이제 다른 두 경로와 **동일한 공통 함수**를 통과한다.
 */
export const processDueSends = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const campaigns = await ctx.db.query("campaigns").collect();
    let processed = 0;
    for (const c of campaigns) {
      if (c.status !== "sending" || !c.scheduledSendAt || c.scheduledSendAt > now) continue;
      const res = await finalizeCampaignSend(ctx, c._id, c.userId);
      processed += res.sent;
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
      embargoAt: v.optional(v.number()),
      drafts: v.array(
        v.object({
          draftId: v.id("emailDrafts"),
          subject: v.string(),
          body: v.string(),
          beatPrimary: v.string(),
          topReferenceTitle: v.optional(v.string()),
          beatSecondary: v.optional(v.array(v.string())),
          beatDistribution: v.optional(
            v.array(v.object({ beat: v.string(), weight: v.number() })),
          ),
          outletCategory: v.optional(v.string()),
          referenceArticles: v.optional(
            v.array(
              v.object({
                title: v.string(),
                url: v.optional(v.string()),
                topic: v.optional(v.string()),
                publishedAtText: v.optional(v.string()),
                publishedAt: v.optional(v.number()),
              }),
            ),
          ),
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
      // ⚠️ 기자 실명·이메일은 포함하지 않는다(AI 경로에도 PII를 넘기지 않는다).
      rows.push({
        draftId: d._id,
        subject: d.subject,
        body: d.body,
        beatPrimary: j.beatPrimary,
        topReferenceTitle: j.topReferenceTitle,
        beatSecondary: j.beatSecondary,
        beatDistribution: j.beatDistribution,
        outletCategory: j.outletCategory,
        referenceArticles: j.referenceArticles,
      });
    }
    return {
      companyName: profile?.companyName ?? pr.who ?? "회사",
      senderName: profile?.senderName ?? "담당자",
      headline: pr.headlines[0] ?? pr.title,
      embargoAt: pr.embargoAt,
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
