import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getProfile } from "./model";
import {
  planAllowsMcp,
  planAllowsSkill,
  skillsForPlan,
  SKILL_IDS,
  upgradeRequiredMessage,
  type Plan,
} from "./lib/plans";
import { resolveUserMcpKey } from "./lib/mcpAuth";
import { scoreJournalist } from "./lib/scoring";
import { journalistCode } from "./lib/mask";
import { classifyReply } from "./lib/replyClassifier";
import { guideSectionText, type GuideSection } from "./lib/pressGuide";
import { lintPressRelease } from "./lib/pressLint";
import { buildEmailDraft, isEmailTemplatePresetId } from "./lib/emailTemplate";
import { needsPilotApproval } from "./lib/pilotGate";
import { createPressReleaseForUser } from "./pressReleases";
import { createCampaignForUser } from "./campaigns";
import { matchForCampaignForUser } from "./journalists";
import { generateDraftsForUser } from "./drafts";

const MCP_OPT_OUT =
  "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.";

export const resolveKey = internalQuery({
  args: { bearer: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      keyId: v.id("userMcpKeys"),
      plan: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { bearer }) => {
    return resolveUserMcpKey(ctx, bearer);
  },
});

export const touchKey = internalMutation({
  args: { keyId: v.id("userMcpKeys") },
  returns: v.null(),
  handler: async (ctx, { keyId }) => {
    await ctx.db.patch(keyId, { lastUsedAt: Date.now() });
    return null;
  },
});

export const status = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    service: v.literal("crabpitch"),
    plan: v.string(),
    mcpAllowed: v.boolean(),
    companyName: v.union(v.string(), v.null()),
    skills: v.array(v.string()),
    lockedSkills: v.array(v.string()),
    skillPack: v.string(),
    compliance: v.string(),
  }),
  handler: async (ctx, { userId }) => {
    const profile = await getProfile(ctx, userId);
    const plan = (profile?.plan as Plan) ?? "free";
    return {
      service: "crabpitch" as const,
      plan,
      mcpAllowed: planAllowsMcp(plan),
      companyName: profile?.companyName ?? null,
      // 이 플랜에서 실제로 쓸 수 있는 스킬만. 무료는 보도자료 작성 하나뿐이다.
      // 스킬 팩이 진입 게이트에서 이 목록을 보고 멈춘다.
      skills: skillsForPlan(plan),
      lockedSkills: SKILL_IDS.filter((s) => !planAllowsSkill(plan, s)),
      skillPack: "https://github.com/contentscoin/crabpitch-skill",
      compliance:
        "기자 실명·이메일은 MCP 응답에 포함되지 않습니다. 발송은 사용자 승인 후에만.",
    };
  },
});

export const matchJournalists = internalQuery({
  args: {
    userId: v.id("users"),
    topicTags: v.array(v.string()),
    topK: v.optional(v.number()),
  },
  returns: v.object({
    error: v.optional(v.string()),
    topicTags: v.optional(v.array(v.string())),
    matches: v.array(
      v.object({
        code: v.string(),
        outlet: v.string(),
        beatPrimary: v.string(),
        contactConfidence: v.string(),
        score: v.number(),
        reason: v.string(),
        topReferenceTitle: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { userId, topicTags, topK }) => {
    // 도구 디스패치 계층에서 이미 막지만 여기서도 본다 — 내부 호출이 늘어도 새지 않도록.
    const profile = await getProfile(ctx, userId);
    if (!planAllowsSkill(profile?.plan as Plan, "journalist-outreach")) {
      return { error: upgradeRequiredMessage("journalist-outreach"), matches: [] };
    }
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
    const tags = topicTags.length ? topicTags : ["IT·스타트업"];
    const scored = journalists
      .map((j) => ({ j, ...scoreJournalist(j, tags) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK ?? 10);

    return {
      topicTags: tags,
      matches: scored.map((x) => ({
        code: journalistCode(x.j._id),
        outlet: x.j.outlet,
        beatPrimary: x.j.beatPrimary,
        contactConfidence: x.j.contactConfidence,
        score: x.score,
        reason: x.reason,
        topReferenceTitle: x.j.topReferenceTitle ?? null,
      })),
    };
  },
});

export const emailTemplate = internalQuery({
  args: {
    outlet: v.string(),
    beat: v.string(),
    headline: v.string(),
    companyName: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  returns: v.object({
    subject: v.string(),
    body: v.string(),
    optOut: v.string(),
    note: v.string(),
  }),
  handler: async (_ctx, args) => {
    const company = args.companyName ?? "당사";
    const { subject, body } = buildEmailDraft(
      {
        companyName: company,
        senderName: "홍보 담당",
        headline: args.headline,
        bodyFact: args.body ?? args.headline,
      },
      {
        beatPrimary: args.beat,
      },
    );
    return {
      subject: subject || `[보도자료] ${args.headline}`,
      body,
      optOut: MCP_OPT_OUT,
      note: "실명·이메일은 발송 시에만 사용하세요. MCP는 템플릿만 제공합니다.",
    };
  },
});

export const classify = internalQuery({
  args: { text: v.string() },
  returns: v.object({
    type: v.string(),
    label: v.string(),
    priority: v.string(),
    matched: v.optional(v.string()),
    questionSubtype: v.optional(v.string()),
    needsEscalation: v.optional(v.boolean()),
  }),
  handler: async (_ctx, { text }) => {
    return classifyReply(text);
  },
});

/**
 * 보도자료 작성 가이드 + 결정적 lint.
 * PII와 무관하며(사용자 자신의 원고만 다룬다) 기존 유료 키 인증을 그대로 쓴다.
 */
export const pressGuide = internalQuery({
  args: {
    section: v.optional(v.string()),
    draft: v.optional(v.string()),
    title: v.optional(v.string()),
    /** 미디어킷 회사 소개 — 넘기면 본문이 원본을 그대로 실었는지 대조한다 */
    boilerplate: v.optional(v.string()),
    /** 미디어킷 팩트시트 — 넘기면 본문 수치가 이 집합의 부분집합인지 대조한다 */
    factSheet: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
  },
  returns: v.object({
    guide: v.string(),
    lint: v.optional(
      v.object({
        status: v.string(),
        summary: v.object({
          critical: v.number(),
          high: v.number(),
          medium: v.number(),
        }),
        violations: v.array(
          v.object({
            level: v.string(),
            severity: v.string(),
            ruleId: v.string(),
            label: v.string(),
            span: v.string(),
            suggestion: v.string(),
          }),
        ),
      }),
    ),
    note: v.string(),
  }),
  handler: async (_ctx, { section, draft, title, boilerplate, factSheet }) => {
    const requested = (section ?? "all") as GuideSection;
    const valid: GuideSection[] = ["structure", "writing", "geo", "adlaw", "presskit", "all"];
    const chosen = valid.includes(requested) ? requested : "all";
    return {
      guide: guideSectionText(chosen),
      lint: draft
        ? lintPressRelease(title ?? "", draft, { boilerplate, factSheet })
        : undefined,
      note: "표시·광고 계열 규범만 다룹니다. 언론중재법은 범위 밖이며 법률 검토를 대체하지 않습니다.",
    };
  },
});

/* ── 캠페인 파이프라인 (MCP) ──────────────────────────────────────────────
 * 아래 함수들은 **웹앱과 같은 구현**을 부른다(`*ForUser` 헬퍼). MCP용 사본을 따로
 * 두면 월 한도·억제 리스트·재접근 거부 같은 규칙이 한쪽에서만 걸린다.
 *
 * ⚠️ 여기 어디에도 **발송 확정은 없다.** 발송은 `smtpActions`/`gmailActions`가
 *    `drafts.selectForExternalSend` → `confirmExternalSent` 게이트를 통과해서 한다.
 */

/** 캠페인 목록 — 기자 실명·이메일은 포함하지 않는다(카운트만). */
export const campaignList = internalQuery({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(50, Math.max(1, limit ?? 20)));
    return Promise.all(
      campaigns.map(async (c) => {
        const drafts = await ctx.db
          .query("emailDrafts")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        const matches = await ctx.db
          .query("matches")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        return {
          campaignId: c._id,
          name: c.name,
          status: c.status,
          matched: matches.length,
          included: matches.filter((m) => m.included).length,
          drafts: drafts.filter((d) => d.status === "draft" || d.status === "queued").length,
          sent: drafts.filter((d) => d.status === "sent" || d.status === "published").length,
          scheduledSendAt: c.scheduledSendAt,
        };
      }),
    );
  },
});

/**
 * 캠페인 상세 — 발송 전에 무엇이 걸려 있는지 보여 준다.
 *
 * 기자는 **익명 코드**로만 나간다. 발송 대상을 세는 데 실명이 필요하지 않다.
 */
export const campaignDetail = internalQuery({
  args: { userId: v.id("users"), campaignId: v.id("campaigns") },
  handler: async (ctx, { userId, campaignId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) {
      throw new Error("캠페인을 찾을 수 없습니다.");
    }
    const pr = await ctx.db.get(campaign.pressReleaseId);
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    const pending = drafts.filter((d) => d.status === "draft" || d.status === "queued");
    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      pressRelease: pr ? { title: pr.title, topicTags: pr.topicTags } : null,
      pendingDrafts: pending.length,
      sentDrafts: drafts.length - pending.length,
      // 파일럿 게이트는 발송 시점에도 다시 걸린다. 여기서는 "지금 걸릴 것인가"만 알려 준다.
      pilotApprovalNeeded: needsPilotApproval(pending),
      complianceBlocked: pending.filter(
        (d) => d.complianceLevel === "fail" || d.complianceLevel === "blocked",
      ).length,
      complianceWarned: pending.filter((d) => d.complianceLevel === "warn").length,
      drafts: pending.map((d) => ({
        draftId: d._id,
        journalist: journalistCode(String(d.journalistId)),
        subject: d.subject,
        approved: d.approvedAt !== undefined,
        compliance: d.complianceLevel ?? "pass",
      })),
    };
  },
});

/** 보도자료 저장 + 캠페인 생성을 한 번에 — MCP에서 두 번 왕복할 이유가 없다. */
export const createCampaign = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    headlines: v.optional(v.array(v.string())),
    topicTags: v.optional(v.array(v.string())),
    who: v.optional(v.string()),
    newsValue: v.optional(v.string()),
    numbers: v.optional(v.string()),
    quote: v.optional(v.string()),
    /** 인용문 화자 — 웹 폼과 같은 필드다. 빠지면 이 경로의 초안만 이름 없이 나간다. */
    spokesName: v.optional(v.string()),
    spokesTitle: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, ...pr }) => {
    const pressReleaseId = await createPressReleaseForUser(ctx, userId, {
      ...pr,
      headlines: pr.headlines?.length ? pr.headlines : [pr.title],
      topicTags: pr.topicTags ?? [],
    });
    const campaignId = await createCampaignForUser(ctx, userId, { pressReleaseId, name });
    return { campaignId, pressReleaseId };
  },
});

export const matchCampaign = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    topK: v.optional(v.number()),
  },
  handler: async (ctx, { userId, campaignId, topK }) => {
    const matched = await matchForCampaignForUser(ctx, userId, { campaignId, topK });
    return { matched };
  },
});

export const generateDrafts = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    preset: v.optional(v.string()),
  },
  handler: async (ctx, { userId, campaignId, preset }) => {
    // 모르는 프리셋 이름은 조용히 무시하고 기본값을 쓴다 — 에이전트가 지어낸 값 때문에
    // 파이프라인 전체가 멈추는 편이 더 나쁘다.
    const presetId =
      preset && isEmailTemplatePresetId(preset) ? preset : undefined;
    const created = await generateDraftsForUser(ctx, userId, {
      campaignId,
      preset: presetId,
    });
    return { created, preset: presetId ?? "standard" };
  },
});

/**
 * 초안 승인 — 파일럿 게이트를 넘기려면 사용자가 실제로 읽었어야 한다.
 *
 * ⚠️ MCP에서 "전부 승인"을 허용하지 않는다. 초안을 한 건도 안 읽고 승인하는 것이
 *    파일럿 게이트가 막으려던 바로 그 상황이다. draftId를 하나씩 받는다.
 */
export const approveDrafts = internalMutation({
  args: { userId: v.id("users"), draftIds: v.array(v.id("emailDrafts")) },
  handler: async (ctx, { userId, draftIds }) => {
    let approved = 0;
    for (const id of draftIds) {
      const d = await ctx.db.get(id);
      if (!d || d.userId !== userId) continue;
      if (d.status !== "draft" && d.status !== "queued") continue;
      // 웹앱의 `drafts.approveDraft`와 같은 필드를 쓴다 — 승인 표시가 경로마다
      // 다르면 파일럿 게이트가 한쪽 승인만 인정하게 된다.
      await ctx.db.patch(id, { approvedAt: Date.now() });
      approved += 1;
    }
    return { approved };
  },
});

/**
 * 기자 메모 — 회신·게재 이력을 사람이 적어 두는 자리.
 * 조회는 익명 코드로 하고, 쓰기는 매칭에 잡힌 기자에 한한다.
 */
export const journalistNote = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    draftId: v.id("emailDrafts"),
    note: v.string(),
  },
  handler: async (ctx, { userId, campaignId, draftId, note }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const draft = await ctx.db.get(draftId);
    if (!draft || draft.campaignId !== campaignId) throw new Error("초안을 찾을 수 없습니다.");
    const journalist = await ctx.db.get(draft.journalistId);
    if (!journalist) throw new Error("기자를 찾을 수 없습니다.");
    const stamped = `[${new Date().toISOString().slice(0, 10)}] ${note.trim()}`;
    await ctx.db.patch(journalist._id, {
      notes: journalist.notes ? `${journalist.notes}\n${stamped}` : stamped,
    });
    return { journalist: journalistCode(String(journalist._id)), note: stamped };
  },
});

/** 회신 목록 — 분류 결과와 함께. 기자는 익명 코드로만 나간다. */
export const replyList = internalQuery({
  args: { userId: v.id("users"), campaignId: v.optional(v.id("campaigns")) },
  handler: async (ctx, { userId, campaignId }) => {
    const campaigns = campaignId
      ? [await ctx.db.get(campaignId)]
      : await ctx.db
          .query("campaigns")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .take(20);
    const out = [];
    for (const c of campaigns) {
      if (!c || c.userId !== userId) continue;
      const replies = await ctx.db
        .query("replies")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      for (const r of replies) {
        out.push({
          campaignId: c._id,
          campaignName: c.name,
          journalist: journalistCode(String(r.journalistId)),
          type: r.type,
          handled: r.handled,
          needsEscalation: r.needsEscalation === true,
          receivedAt: r._creationTime,
          reapproachOk: r.reapproachOk,
        });
      }
    }
    return out;
  },
});
