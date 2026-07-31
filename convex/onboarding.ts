import { v } from "convex/values";
import { query } from "./_generated/server";
import { getProfile, requireUser } from "./model";

/**
 * 온보딩 체크리스트 — **대시보드가 이미 구독하지 않는 것만** 서버에서 묶는다.
 *
 * 캠페인·매칭·발송(③④⑤)은 여기서 세지 않는다. 이유:
 *  - 대시보드가 이미 `campaigns.list`를 구독한다 → 쿼리를 늘릴 이유가 없다.
 *  - `campaigns.list`는 `activeClientId`가 있으면 `by_client`로 전환하는데,
 *    `usage.getAnalytics`는 항상 `by_user`를 쓴다. 두 쿼리가 **다른 축**을 보는 기존
 *    불일치가 있으므로, 온보딩이 `getAnalytics`에 얹히면 그 불일치를 상속한다.
 *    클라이언트 축을 이미 존중하는 `campaigns.list`로 계산하는 쪽이 맞다.
 *
 * 판정 규칙 자체는 `lib/onboarding.ts`의 순수 함수에 있다(테스트 가능하게).
 */
export const getMyChecklist = query({
  args: {},
  returns: v.object({
    /** 사용자가 발신 아이덴티티를 직접 저장했는가(`profileConfirmedAt`). */
    profileDone: v.boolean(),
    /**
     * 발신 수단 종류.
     *
     * ⚠️ `smtp`를 우선한다 — 둘 다 연결돼 있으면 **실제로 메일이 나가는 쪽**을 알려야 한다.
     *    `gmail_drafts`는 발송이 아니라 Gmail 초안 생성이다(`schema.sendModeValidator` 주석).
     */
    senderKind: v.union(v.literal("smtp"), v.literal("gmail"), v.literal("none")),
    /** SMTP 마지막 연결이 실패했는가 — "저장됐다 ≠ 붙는다". */
    senderNeedsCheck: v.boolean(),
    /** 에이전시 클라이언트 컨텍스트인가 — 진행률 축이 갈린다. */
    isClientScoped: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);

    // ⚠️ 사용자 축으로만 조회한다. `gmailAccounts`·`smtpAccounts`에는 `agencyClientId`가
    //    없으므로 클라이언트를 바꿔도 발신 수단은 동일하다.
    const smtp = await ctx.db
      .query("smtpAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const gmail = smtp
      ? null
      : await ctx.db
          .query("gmailAccounts")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique();

    return {
      profileDone: profile?.profileConfirmedAt !== undefined,
      senderKind: smtp ? ("smtp" as const) : gmail ? ("gmail" as const) : ("none" as const),
      senderNeedsCheck: smtp?.lastStatus === "error",
      isClientScoped: profile?.activeClientId !== undefined,
    };
  },
});
