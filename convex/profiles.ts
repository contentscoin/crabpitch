import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return { user, profile };
  },
});

export const ensureProfile = mutation({
  args: { companyName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;
    const user = await ctx.db.get(userId);
    return await ctx.db.insert("profiles", {
      userId,
      companyName: args.companyName ?? user?.name ?? "내 회사",
      plan: "free",
      senderName: user?.name ?? undefined,
      contactEmail: user?.email ?? undefined,
      gmailConnected: false,
    });
  },
});

/**
 * 온보딩 ①단계("발신 정보 저장")를 완료로 볼 수 있는 인자가 왔는가.
 *
 * `updateProfile`은 발신 정보 저장 전용이 아니다 — 설정 화면의 플랜 카드가
 * `update({ plan })`으로, Gmail 연결 흐름이 `update({ gmailConnected })`로 같은 mutation을
 * 쓴다. 인자를 보지 않고 도장을 찍으면 **회사명·보내는 사람·회신 주소를 한 번도 저장하지
 * 않은 사용자가 플랜 버튼 한 번으로 ①단계를 통과한다.** `ensureProfile`을 막아 봐야
 * 자동 완료가 다른 문으로 들어오는 것이다.
 *
 * `boilerplate`도 세지 않는다 — 제품 어디에서도 읽히지 않는 필드이므로(보도자료는
 * `mediaKits.boilerplate`를 쓴다) 그것만 저장한 것을 "발신 정보를 확인했다"고 볼 수 없다.
 */
function confirmsSenderIdentity(args: {
  companyName?: string;
  senderName?: string;
  contactEmail?: string;
}): boolean {
  return (
    args.companyName !== undefined ||
    args.senderName !== undefined ||
    args.contactEmail !== undefined
  );
}

export const updateProfile = mutation({
  args: {
    companyName: v.optional(v.string()),
    boilerplate: v.optional(v.string()),
    senderName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    plan: v.optional(
      v.union(v.literal("free"), v.literal("solo"), v.literal("growth"), v.literal("agency")),
    ),
    gmailConnected: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("로그인이 필요합니다.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("프로필이 없습니다.");
    const { plan, ...rest } = args;
    await ctx.db.patch(profile._id, {
      ...rest,
      ...(plan ? { plan } : {}),
      ...(confirmsSenderIdentity(args) ? { profileConfirmedAt: Date.now() } : {}),
    });
    return profile._id;
  },
});
