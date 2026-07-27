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
import { buildEmailDraft } from "./lib/emailTemplate";

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
