import { mutation } from "./_generated/server";
import { requireUser } from "./model";
import { scoreJournalist } from "./lib/scoring";

/**
 * 기자 온톨로지 시드(데모). 실서비스에서는 OpenCrab MCP/API 로 대체.
 * 모든 레코드 mailing_status: "candidate" (발송 미승인).
 */
const SEED_JOURNALISTS = [
  // ── demo/데모_실행기록.md 의 실제 매칭 5인 (candidate) ──
  { name: "이도원", outlet: "지디넷코리아", email: "leespot@zdnet.co.kr", beatPrimary: "플랫폼/인터넷·핀테크", beatSecondary: ["스타트업", "투자"], contactConfidence: "high" as const, referenceArticleCount: 14, topReferenceTitle: "레드브릭하우스 카카오벤처스 투자 유치", topReferenceUrl: "https://zdnet.co.kr/", },
  { name: "이정현", outlet: "지디넷코리아", email: "jh7253@zdnet.co.kr", beatPrimary: "AI/데이터·모바일", beatSecondary: ["스타트업", "SaaS"], contactConfidence: "high" as const, referenceArticleCount: 12, topReferenceTitle: "국내 AI 스타트업 기술 동향", topReferenceUrl: "https://zdnet.co.kr/", },
  { name: "박진형", outlet: "전자신문", email: "jin@etnews.com", beatPrimary: "소프트웨어/보안·AI/데이터", beatSecondary: ["SaaS", "클라우드"], contactConfidence: "high" as const, referenceArticleCount: 9, topReferenceTitle: "국산 SaaS 기업 성장세", topReferenceUrl: "https://etnews.com/", },
  { name: "최다현", outlet: "전자신문", email: "da2109@etnews.com", beatPrimary: "AI/데이터·플랫폼/인터넷", beatSecondary: ["커머스"], contactConfidence: "medium" as const, referenceArticleCount: 11, topReferenceTitle: "플랫폼 규제와 AI 커버리지", topReferenceUrl: "https://etnews.com/", },
  { name: "박지호", outlet: "전자신문", email: "jihopress@etnews.com", beatPrimary: "AI/데이터·반도체", beatSecondary: ["딥테크"], contactConfidence: "medium" as const, referenceArticleCount: 8, topReferenceTitle: "AI 반도체 스타트업 조명", topReferenceUrl: "https://etnews.com/", },
  // ── 추가 beat 커버리지 (seed) ──
  { name: "김유통", outlet: "머니투데이", email: "retail.k@mt.co.kr", beatPrimary: "유통/커머스", beatSecondary: ["소비 트렌드"], contactConfidence: "high" as const, referenceArticleCount: 13, topReferenceTitle: "이커머스 셀러 성장 리포트", topReferenceUrl: "https://mt.co.kr/", source: "seed" },
  { name: "정벤처", outlet: "매일경제", email: "vc.jung@mk.co.kr", beatPrimary: "벤처투자", beatSecondary: ["스타트업", "IPO"], contactConfidence: "high" as const, referenceArticleCount: 15, topReferenceTitle: "시드·시리즈A 투자 동향", topReferenceUrl: "https://mk.co.kr/", source: "seed" },
  { name: "한정책", outlet: "서울경제", email: "policy.han@sedaily.com", beatPrimary: "정책/공공", beatSecondary: ["창업 지원사업"], contactConfidence: "medium" as const, referenceArticleCount: 7, topReferenceTitle: "정부 창업지원 정책 점검", topReferenceUrl: "https://sedaily.com/", source: "seed" },
  { name: "오뷰티", outlet: "한국경제", email: "beauty.oh@hankyung.com", beatPrimary: "뷰티/consumer", beatSecondary: ["브랜드", "D2C"], contactConfidence: "medium" as const, referenceArticleCount: 6, topReferenceTitle: "인디 뷰티 브랜드 부상", topReferenceUrl: "https://hankyung.com/", source: "seed" },
  { name: "신푸드", outlet: "블로터", email: "food.shin@bloter.net", beatPrimary: "F&B/외식", beatSecondary: ["푸드테크"], contactConfidence: "low" as const, referenceArticleCount: 4, topReferenceTitle: "푸드테크 스타트업 트렌드", topReferenceUrl: "https://bloter.net/", source: "seed" },
  { name: "강지역", outlet: "부산일보", email: "local.kang@busan.com", beatPrimary: "지역/소상공인", beatSecondary: ["로컬 상권"], contactConfidence: "medium" as const, referenceArticleCount: 5, topReferenceTitle: "지역 소상공인 디지털 전환", topReferenceUrl: "https://busan.com/", source: "seed" },
  { name: "문핀테크", outlet: "머니투데이", email: "fintech.moon@mt.co.kr", beatPrimary: "핀테크·금융", beatSecondary: ["결제", "투자"], contactConfidence: "high" as const, referenceArticleCount: 10, topReferenceTitle: "소상공인 금융 서비스 확산", topReferenceUrl: "https://mt.co.kr/", source: "seed" },
];

/** 기자 DB가 비어있으면 시드. 반환: 삽입한 레코드 수. */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const existing = await ctx.db.query("journalists").take(1);
    if (existing.length > 0) return 0;
    let n = 0;
    for (const j of SEED_JOURNALISTS) {
      await ctx.db.insert("journalists", {
        name: j.name,
        outlet: j.outlet,
        email: j.email,
        beatPrimary: j.beatPrimary,
        beatSecondary: j.beatSecondary,
        contactConfidence: j.contactConfidence,
        referenceArticleCount: j.referenceArticleCount,
        topReferenceTitle: j.topReferenceTitle,
        topReferenceUrl: j.topReferenceUrl,
        mailingStatus: "candidate",
        source: (j as { source?: string }).source ?? "seed",
      });
      n += 1;
    }
    return n;
  },
});

/** 현재 사용자에게 데모 보도자료 + 캠페인 + 매칭을 생성(대시보드 체험용). */
export const seedDemoForMe = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);

    // 기자 DB 보장
    const anyJournalist = await ctx.db.query("journalists").take(1);
    if (anyJournalist.length === 0) {
      for (const j of SEED_JOURNALISTS) {
        await ctx.db.insert("journalists", {
          name: j.name,
          outlet: j.outlet,
          email: j.email,
          beatPrimary: j.beatPrimary,
          beatSecondary: j.beatSecondary,
          contactConfidence: j.contactConfidence,
          referenceArticleCount: j.referenceArticleCount,
          topReferenceTitle: j.topReferenceTitle,
          topReferenceUrl: j.topReferenceUrl,
          mailingStatus: "candidate",
          source: (j as { source?: string }).source ?? "seed",
        });
      }
    }

    // 이미 캠페인이 있으면 스킵
    const existingCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1);
    if (existingCampaigns.length > 0) return { created: false };

    const topicTags = ["IT·스타트업", "벤처투자", "SaaS", "AI"];
    const prId = await ctx.db.insert("pressReleases", {
      userId,
      title: "큐레잇 시드 10억 유치",
      headlines: [
        "소상공인 매출관리 AI '큐레잇', 시드 10억 유치…\"3개월 만에 가입 1만 매장\"",
        "'큐레잇' 시드 10억 원 투자 유치, 월 마감 4시간→20분 단축",
        "매출관리 SaaS '큐레잇', 출시 3개월 만에 전국 1만 매장",
      ],
      body: "소상공인 매출관리 AI 스타트업 '큐레잇'이 시드 라운드 10억 원을 유치했다. 출시 3개월 만에 전국 1만 개 매장이 가입했으며, 월 마감 정산 시간을 4시간에서 20분으로 단축했다.",
      topicTags,
      who: "큐레잇",
      newsValue: "투자 유치 + 빠른 성장",
      numbers: "시드 10억 원, 3개월 만에 1만 매장, 정산 4시간→20분",
      quote: "소상공인의 마감 부담을 없애는 것이 목표입니다.",
      links: [],
      status: "ready",
    });

    const campaignId = await ctx.db.insert("campaigns", {
      userId,
      pressReleaseId: prId,
      name: "큐레잇 시드 투자 배포",
      status: "matched",
    });

    // 매칭 실행(수신거부 제외)
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
    const scored = journalists
      .map((j) => ({ j, ...scoreJournalist(j, topicTags) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    for (const x of scored) {
      await ctx.db.insert("matches", {
        campaignId,
        journalistId: x.j._id,
        score: x.score,
        reason: x.reason,
        included: x.j.contactConfidence !== "low",
      });
    }

    return { created: true, campaignId, matched: scored.length };
  },
});
