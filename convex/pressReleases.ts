import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser, getProfile, bumpPressReleases } from "./model";
import { PLAN_LIMITS, currentMonth, type Plan } from "./lib/plans";
import { canAccessClientScoped, getMembership } from "./lib/agencyAuth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    if (profile?.activeClientId) {
      const client = await ctx.db.get(profile.activeClientId);
      const member =
        client && (await getMembership(ctx, client.agencyId, userId));
      if (member) {
        return ctx.db
          .query("pressReleases")
          .withIndex("by_client", (q) =>
            q.eq("agencyClientId", profile.activeClientId!),
          )
          .order("desc")
          .collect();
      }
    }
    return ctx.db
      .query("pressReleases")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("pressReleases") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const pr = await ctx.db.get(id);
    if (!pr || !(await canAccessClientScoped(ctx, userId, pr.userId, pr.agencyClientId))) {
      return null;
    }
    return pr;
  },
});

/**
 * GEO 확장 필드 검증자 — 전부 optional이라 기존 호출부는 그대로 동작한다.
 * ⚠️ FAQ 문항 수는 규정하지 않는다(`GEO_TARGETS.faqCount`가 undefined — 팩에 규정 없음).
 */
const geoArgs = {
  /** 최상단 3줄 요약 */
  keyTakeaways: v.optional(v.array(v.string())),
  /** 하단 Q&A */
  faq: v.optional(v.array(v.object({ q: v.string(), a: v.string() }))),
  /** 부제 */
  subheads: v.optional(v.array(v.string())),
} as const;

export interface PressReleaseInput {
  title: string;
  headlines: string[];
  body: string;
  topicTags: string[];
  who?: string;
  newsValue?: string;
  numbers?: string;
  quote?: string;
  /**
   * 인용문 화자 — 「이름 + 직함」으로 조립된다("홍길동 대표는 …").
   *
   * MCP 경로도 이 필드를 채울 수 있어야 한다. 빠뜨리면 채팅으로 만든 보도자료만
   * 화자 없이 「대표는 "…"라고 밝혔습니다」로 나간다.
   */
  spokesName?: string;
  spokesTitle?: string;
  links?: string[];
  keyTakeaways?: string[];
  faq?: Array<{ q: string; a: string }>;
  subheads?: string[];
}

/**
 * 보도자료 저장 — **웹앱과 MCP가 공유하는 단일 구현.**
 *
 * `userId`를 인자로 받는 이유는 MCP에 로그인 세션이 없기 때문이다(키로 사용자를 찾는다).
 * 경로마다 구현을 따로 두면 월 한도 같은 규칙이 한쪽에서만 걸린다.
 */
export async function createPressReleaseForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: PressReleaseInput,
): Promise<Id<"pressReleases">> {
  // 무료 티어 보도자료 월 한도 체크
  const profile = await getProfile(ctx, userId);
  const plan: Plan = (profile?.plan as Plan) ?? "free";
  const month = currentMonth();
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();
  if ((usage?.pressReleasesUsed ?? 0) >= PLAN_LIMITS[plan].pressReleases) {
    throw new Error(
      `이번 달 보도자료 작성 한도(${PLAN_LIMITS[plan].pressReleases}건)를 초과했습니다. 플랜을 업그레이드하세요.`,
    );
  }

  const id = await ctx.db.insert("pressReleases", {
    userId,
    title: args.title,
    headlines: args.headlines,
    body: args.body,
    topicTags: args.topicTags,
    who: args.who,
    newsValue: args.newsValue,
    numbers: args.numbers,
    quote: args.quote,
    spokesName: args.spokesName,
    spokesTitle: args.spokesTitle,
    links: args.links,
    keyTakeaways: args.keyTakeaways,
    faq: args.faq,
    subheads: args.subheads,
    status: "ready",
    agencyClientId: profile?.activeClientId,
  });
  await bumpPressReleases(ctx, userId, 1);
  return id;
}

export const create = mutation({
  args: {
    title: v.string(),
    headlines: v.array(v.string()),
    body: v.string(),
    topicTags: v.array(v.string()),
    who: v.optional(v.string()),
    newsValue: v.optional(v.string()),
    numbers: v.optional(v.string()),
    quote: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
    /** 인용문 화자 — 메일 초안의 「홍길동 대표는 …」 조립에 쓰인다. */
    spokesName: v.optional(v.string()),
    spokesTitle: v.optional(v.string()),
    ...geoArgs,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return createPressReleaseForUser(ctx, userId, args);
  },
});

/**
 * 저장된 보도자료 부분 수정 — 전달된 필드만 덮어쓴다.
 * 값을 넘기지 않은 필드는 건드리지 않아 기존 레코드(신규 필드가 없는 것 포함)가 그대로 남는다.
 */
export const update = mutation({
  args: {
    id: v.id("pressReleases"),
    title: v.optional(v.string()),
    headlines: v.optional(v.array(v.string())),
    body: v.optional(v.string()),
    /** 화자 — 이 필드가 생기기 전에 만든 보도자료도 나중에 채울 수 있어야 한다. */
    spokesName: v.optional(v.string()),
    spokesTitle: v.optional(v.string()),
    ...geoArgs,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const pr = await ctx.db.get(args.id);
    if (!pr || !(await canAccessClientScoped(ctx, userId, pr.userId, pr.agencyClientId))) {
      throw new Error("보도자료를 찾을 수 없습니다.");
    }
    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.headlines !== undefined ? { headlines: args.headlines } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(args.spokesName !== undefined ? { spokesName: args.spokesName } : {}),
      ...(args.spokesTitle !== undefined ? { spokesTitle: args.spokesTitle } : {}),
      ...(args.keyTakeaways !== undefined ? { keyTakeaways: args.keyTakeaways } : {}),
      ...(args.faq !== undefined ? { faq: args.faq } : {}),
      ...(args.subheads !== undefined ? { subheads: args.subheads } : {}),
    });
    return args.id;
  },
});
