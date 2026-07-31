import { v } from "convex/values";
import { query } from "./_generated/server";
import { getProfile, requireUser } from "./model";
import { resolveActiveClientScope } from "./lib/agencyAuth";

/**
 * 온보딩 체크리스트 — **대시보드가 이미 구독하지 않는 것만** 서버에서 묶는다.
 *
 * 캠페인·매칭·발송(③④⑤)은 여기서 세지 않는다. 이유:
 *  - 대시보드가 이미 `campaigns.list`를 구독한다 → 쿼리를 늘릴 이유가 없다.
 *  - `usage.getAnalytics`는 활성 클라이언트를 무시하고 항상 사용자 축으로 조회한다.
 *    온보딩이 거기 얹히면 에이전시 모드에서 그 축 불일치를 상속한다. 이미 클라이언트
 *    축을 존중하는 `campaigns.list`로 계산하는 쪽이 맞다.
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
    /**
     * SMTP 마지막 연결 결과. `senderKind !== "smtp"`이면 null.
     *
     * `unverified`를 `ok`와 구분하는 이유: 접속 정보를 저장하면 `lastStatus`가 지워진다
     * (이전 테스트 결과가 더 이상 유효하지 않으므로). 한 번도 붙어 본 적 없는 계정을
     * `ok`로 취급하면 "실제 메일이 나갑니다"를 근거 없이 단정한다.
     */
    smtpStatus: v.union(
      v.literal("ok"),
      v.literal("error"),
      v.literal("unverified"),
      v.null(),
    ),
    /**
     * 캠페인 집계가 클라이언트 축인가.
     *
     * ⚠️ `activeClientId` 존재만으로 판정하면 안 된다 — 클라이언트 문서가 삭제되거나
     *    멤버십이 박탈되면 `campaigns.list`는 조용히 사용자 축으로 떨어진다. 그 상태에서
     *    "이 클라이언트 n/3"이라고 적으면 라벨과 집계 대상이 어긋난다.
     *    그래서 `campaigns.list`와 **같은 헬퍼**로 판정한다.
     */
    isClientScoped: v.boolean(),
    /** 배너 스누즈를 사용자별로 나누기 위한 키. 다른 계정이 상속하지 않게 한다. */
    scopeKey: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);

    // ⚠️ 사용자 축으로만 조회한다. `gmailAccounts`·`smtpAccounts`에는 클라이언트 구분이
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

    const clientId = await resolveActiveClientScope(ctx, userId, profile);

    return {
      profileDone: profile?.profileConfirmedAt !== undefined,
      senderKind: smtp ? ("smtp" as const) : gmail ? ("gmail" as const) : ("none" as const),
      smtpStatus: smtp ? (smtp.lastStatus ?? ("unverified" as const)) : null,
      isClientScoped: clientId !== null,
      scopeKey: userId,
    };
  },
});
