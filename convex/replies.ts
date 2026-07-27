import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireUser } from "./model";
import {
  classifyReply,
  buildReplyDraft,
  buildReplyDraftVariant,
  REPLY_TEMPLATE_VARIANTS,
  type QuestionSubtype,
  type ReplyType,
} from "./lib/replyClassifier";
import { resolveReplyClassification } from "./lib/replyLlm";
import { journalistCode } from "./lib/mask";
import { defaultInterviewSlots, formatInterviewConfirmDraft } from "./lib/interviewSlots";
import { replyTypeValidator } from "./schema";

/**
 * 수신거부 판정 시 억제 리스트 등록 — **분류 경로(규칙/AI 폴백)와 무관하게** 서버가 강제한다.
 * 등록 지점이 갈라지면 한쪽만 고쳐지는 드리프트가 생기므로 단일 함수로 둔다.
 */
async function ensureSuppressed(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
  reason: string,
): Promise<void> {
  const existing = await ctx.db
    .query("suppressionList")
    .withIndex("by_user_email", (q) => q.eq("userId", userId).eq("email", email))
    .unique();
  if (existing) return;
  await ctx.db.insert("suppressionList", { userId, email, reason });
}

/** 기자 회신 입력 → 7유형 분류 + 답장 초안 생성. 수신거부는 즉시 억제 리스트 반영. */
export const add = mutation({
  args: {
    campaignId: v.id("campaigns"),
    journalistId: v.id("journalists"),
    rawBody: v.string(),
  },
  handler: async (ctx, { campaignId, journalistId, rawBody }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("캠페인을 찾을 수 없습니다.");
    const j = await ctx.db.get(journalistId);
    if (!j) throw new Error("기자를 찾을 수 없습니다.");

    const { type, questionSubtype, needsEscalation } = classifyReply(rawBody);
    const interviewSlots = type === "interview" ? [...defaultInterviewSlots()] : undefined;
    // 자료 요청 응대는 "약속한 자료만" 안내한다 — 보도자료에 실제로 걸어둔 링크만 넘긴다.
    const pr = await ctx.db.get(campaign.pressReleaseId);
    const draftResponse = buildReplyDraft(type, {
      ...(interviewSlots
        ? { slots: [interviewSlots[0]!, interviewSlots[1]!, interviewSlots[2]!] as [string, string, string] }
        : {}),
      ...(pr?.links?.length ? { links: pr.links } : {}),
      ...(questionSubtype ? { questionSubtype } : {}),
    });

    const id = await ctx.db.insert("replies", {
      campaignId,
      journalistId,
      type,
      rawBody,
      draftResponse,
      templateVariant: "default",
      handled: false,
      ...(interviewSlots ? { interviewSlots } : {}),
      ...(questionSubtype ? { questionSubtype } : {}),
      ...(needsEscalation ? { needsEscalation } : {}),
    });

    if (type === "unsubscribe") {
      await ensureSuppressed(ctx, userId, j.email, "기자 회신 수신거부");
    }

    if (type === "published") {
      const draft = await ctx.db
        .query("emailDrafts")
        .withIndex("by_campaign_journalist", (q) =>
          q.eq("campaignId", campaignId).eq("journalistId", journalistId),
        )
        .unique();
      if (draft) await ctx.db.patch(draft._id, { status: "published" });
    }

    return { id, type };
  },
});

export const listByCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return [];
    const replies = await ctx.db
      .query("replies")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .collect();
    return Promise.all(
      replies.map(async (r) => {
        const j = await ctx.db.get(r.journalistId);
        return { ...r, code: journalistCode(r.journalistId), outlet: j?.outlet ?? "?" };
      }),
    );
  },
});

export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const nameById = new Map(campaigns.map((c) => [c._id, c.name] as const));
    const groups = await Promise.all(
      campaigns.map(async (c) => {
        const replies = await ctx.db
          .query("replies")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect();
        return Promise.all(
          replies.map(async (r) => {
            const j = await ctx.db.get(r.journalistId);
            return {
              ...r,
              code: journalistCode(r.journalistId),
              outlet: j?.outlet ?? "?",
              campaignName: nameById.get(r.campaignId) ?? "",
            };
          }),
        );
      }),
    );
    return groups.flat().sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const markHandled = mutation({
  args: { id: v.id("replies") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    await ctx.db.patch(id, { handled: true });
  },
});

/** 응대 템플릿 변형 적용 → 답장 초안 재생성. */
export const applyReplyTemplate = mutation({
  args: { id: v.id("replies"), variantId: v.string() },
  handler: async (ctx, { id, variantId }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.handled || r.interviewConfirmedAt !== undefined) {
      throw new Error("이미 처리된 회신입니다. 템플릿 변형을 적용할 수 없습니다.");
    }

    const variants = REPLY_TEMPLATE_VARIANTS[r.type as ReplyType] ?? [];
    if (!variants.some((v) => v.id === variantId)) {
      throw new Error("지원하지 않는 템플릿입니다.");
    }

    const slots =
      r.type === "interview" && r.interviewSlots && r.interviewSlots.length >= 3
        ? ([r.interviewSlots[0]!, r.interviewSlots[1]!, r.interviewSlots[2]!] as [
            string,
            string,
            string,
          ])
        : undefined;
    const pr = await ctx.db.get(campaign.pressReleaseId);
    const draftResponse = buildReplyDraftVariant(r.type as ReplyType, variantId, {
      ...(slots ? { slots } : {}),
      ...(pr?.links?.length ? { links: pr.links } : {}),
      ...(r.questionSubtype ? { questionSubtype: r.questionSubtype as QuestionSubtype } : {}),
    });
    await ctx.db.patch(id, { draftResponse, templateVariant: variantId });
    return { variantId };
  },
});

/** 인터뷰 일정 1안 확정 → 답장 초안 갱신 + 처리 완료. */
export const confirmInterviewSlot = mutation({
  args: {
    id: v.id("replies"),
    slot: v.string(),
  },
  handler: async (ctx, { id, slot }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.type !== "interview") throw new Error("인터뷰 회신만 일정을 확정할 수 있습니다.");

    const draftResponse = formatInterviewConfirmDraft(slot);
    await ctx.db.patch(id, {
      interviewPickedSlot: slot,
      interviewConfirmedAt: Date.now(),
      draftResponse,
      handled: true,
    });
    return { slot };
  },
});

/** 인터뷰 슬롯 재생성(기본 3안). */
export const refreshInterviewSlots = mutation({
  args: { id: v.id("replies") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.type !== "interview") throw new Error("인터뷰 회신만 가능합니다.");

    const interviewSlots = [...defaultInterviewSlots()];
    const pr = await ctx.db.get(campaign.pressReleaseId);
    // 사용자가 고른 응대 톤(templateVariant)을 유지한 채 일정만 갱신한다.
    const draftResponse = buildReplyDraftVariant("interview", r.templateVariant ?? "default", {
      slots: [interviewSlots[0]!, interviewSlots[1]!, interviewSlots[2]!],
      ...(pr?.links?.length ? { links: pr.links } : {}),
    });
    await ctx.db.patch(id, { interviewSlots, draftResponse });
    return interviewSlots;
  },
});

/* ── S11: BYOK 회신 분류 폴백 (aiActions.classifyReplyWithAi 전용) ──────────
 * LLM 실호출은 액션("use node")에서 하고, 여기서는 입력 제공과 **최종 판정·억제 등록**만 맡는다.
 * 판정을 액션 결과에 맡기지 않는 이유는 컴플라이언스다 — 키워드 우선순위와 억제 등록은
 * DB를 실제로 쓰는 이 계층에서 다시 강제해야 우회 경로가 남지 않는다.
 */

/** 분류 폴백 입력 조회. 회신 본문 외 기자 PII(실명·이메일)는 액션으로 내보내지 않는다. */
export const getForAiClassify = internalQuery({
  args: { replyId: v.id("replies"), userId: v.id("users") },
  returns: v.union(
    v.object({
      rawBody: v.string(),
      type: replyTypeValidator,
      /** 이미 처리·확정된 회신 — 재분류로 사용자가 손댄 초안을 덮어쓰면 안 된다 */
      locked: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { replyId, userId }) => {
    const r = await ctx.db.get(replyId);
    if (!r) return null;
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) return null;
    return {
      rawBody: r.rawBody,
      type: r.type,
      locked: r.handled || r.interviewConfirmedAt !== undefined,
    };
  },
});

/**
 * LLM이 제안한 유형 적용. **제안은 제안일 뿐** — 서버가 원문으로 다시 판정한다.
 * ① 키워드가 잡히면 제안을 아예 보지 않고 규칙 결과를 쓴다(`resolveReplyClassification`).
 * ② 최종이 수신거부면 규칙 경로와 똑같이 억제 리스트에 등록한다.
 * ③ 게재 통보로 인한 초안 상태 전이는 규칙 경로에만 남긴다 — 억제는 과잉 적용해도 안전하지만
 *    발송 이력을 'published'로 바꾸는 건 LLM 오판 시 되돌리기 어려운 상태 변경이다.
 */
export const applyAiClassification = internalMutation({
  args: {
    replyId: v.id("replies"),
    userId: v.id("users"),
    proposal: v.union(
      v.object({
        type: replyTypeValidator,
        questionSubtype: v.optional(
          v.union(
            v.literal("numbers"),
            v.literal("competitor"),
            v.literal("intent"),
            v.literal("roadmap"),
            v.literal("negative"),
          ),
        ),
      }),
      v.null(),
    ),
  },
  returns: v.object({
    type: replyTypeValidator,
    source: v.union(v.literal("rule"), v.literal("llm")),
    changed: v.boolean(),
    /** 억제 리스트에 올라 있는가 — 수신거부 판정 시 항상 true */
    suppressed: v.boolean(),
  }),
  handler: async (ctx, { replyId, userId, proposal }) => {
    const r = await ctx.db.get(replyId);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.handled || r.interviewConfirmedAt !== undefined) {
      throw new Error("이미 처리된 회신입니다. 재분류할 수 없습니다.");
    }

    const resolved = resolveReplyClassification(r.rawBody, proposal);

    // 초안은 유형에서 파생되므로 유형이 바뀌면 다시 만든다. 사용자가 고른 변형은 유지할 수
    // 없다 — 변형 id는 유형별로 다르다(applyReplyTemplate과 동일 제약).
    const interviewSlots =
      resolved.type === "interview"
        ? (r.interviewSlots?.length ? r.interviewSlots : [...defaultInterviewSlots()])
        : undefined;
    const pr = await ctx.db.get(campaign.pressReleaseId);
    const draftResponse = buildReplyDraft(resolved.type, {
      ...(interviewSlots && interviewSlots.length >= 3
        ? {
            slots: [interviewSlots[0]!, interviewSlots[1]!, interviewSlots[2]!] as [
              string,
              string,
              string,
            ],
          }
        : {}),
      ...(pr?.links?.length ? { links: pr.links } : {}),
      ...(resolved.questionSubtype ? { questionSubtype: resolved.questionSubtype } : {}),
    });

    await ctx.db.patch(replyId, {
      type: resolved.type,
      draftResponse,
      templateVariant: "default",
      interviewSlots,
      questionSubtype: resolved.questionSubtype,
      needsEscalation: resolved.needsEscalation,
    });

    let suppressed = false;
    if (resolved.type === "unsubscribe") {
      const j = await ctx.db.get(r.journalistId);
      if (!j) throw new Error("기자를 찾을 수 없어 수신거부를 등록하지 못했습니다.");
      await ensureSuppressed(ctx, userId, j.email, "기자 회신 수신거부(AI 분류)");
      suppressed = true;
    }

    return {
      type: resolved.type,
      source: resolved.source,
      changed: r.type !== resolved.type,
      suppressed,
    };
  },
});

/* ── 게재 후 처리 (S12) ─────────────────────────────────────── */

/**
 * 게재 통보에 대한 정정 요청.
 * 기사에 사실과 다른 내용이 있으면 감사 인사보다 정정이 먼저다. 무엇이 어떻게 다른지는
 * 사용자가 적고, 서버는 그 문장을 초안에 그대로 넣는다(사실을 생성하지 않는다).
 */
export const requestCorrection = mutation({
  args: { id: v.id("replies"), correctionNote: v.string() },
  handler: async (ctx, { id, correctionNote }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    if (r.type !== "published") {
      throw new Error("게재 통보에만 정정을 요청할 수 있습니다.");
    }
    const note = correctionNote.trim();
    if (note.length < 5) {
      throw new Error("무엇이 어떻게 다른지 한 문장으로 적어 주세요.");
    }

    const draftResponse = buildReplyDraftVariant("published", "correction", {
      correctionNote: note,
    });
    await ctx.db.patch(id, {
      draftResponse,
      templateVariant: "correction",
      correctionRequestedAt: Date.now(),
      correctionNote: note,
      // 정정은 사실관계가 걸린 사안이라 담당자가 직접 확인하고 보낸다.
      needsEscalation: true,
      handled: false,
    });
    return { ok: true };
  },
});

/**
 * 보류 회신 뒤 재접근 가능 여부 기록.
 * `false`면 이 사용자의 이후 매칭에서 해당 기자를 제외한다 — 수신거부(법적 억제)와는
 * 다른 축이고, 사용자 판단이므로 다시 켤 수 있다.
 */
export const setReapproach = mutation({
  args: { id: v.id("replies"), reapproachOk: v.boolean() },
  handler: async (ctx, { id, reapproachOk }) => {
    const userId = await requireUser(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error("회신을 찾을 수 없습니다.");
    const campaign = await ctx.db.get(r.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("권한이 없습니다.");
    await ctx.db.patch(id, { reapproachOk });
    return { reapproachOk };
  },
});

/** 이 사용자가 "다시 접근하지 않음"으로 표시한 기자 목록(매칭 제외용). */
export const listNoReapproach = query({
  args: {},
  returns: v.array(v.id("journalists")),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out = new Set<string>();
    for (const c of campaigns) {
      const replies = await ctx.db
        .query("replies")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      for (const r of replies) {
        if (r.reapproachOk === false) out.add(String(r.journalistId));
      }
    }
    return [...out] as Id<"journalists">[];
  },
});
