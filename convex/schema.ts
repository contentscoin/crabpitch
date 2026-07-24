import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * 크랩피치 도메인 모델.
 * 인증 테이블(users, authAccounts, authSessions ...)은 @convex-dev/auth 의 authTables 로 주입.
 */

export const planValidator = v.union(
  v.literal("free"),
  v.literal("solo"),
  v.literal("growth"),
  v.literal("agency"),
);

export const confidenceValidator = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

// 회신 7유형 (reply-handler 스킬)
export const replyTypeValidator = v.union(
  v.literal("interview"), // ① 인터뷰 요청
  v.literal("materials"), // ② 자료 요청
  v.literal("question"), // ③ 확인 질문
  v.literal("published"), // ④ 게재 통보
  v.literal("hold"), // ⑤ 보류/거절
  v.literal("unsubscribe"), // ⑥ 수신거부
  v.literal("complaint"), // ⑦ 부정/컴플레인
);

export const campaignStatusValidator = v.union(
  v.literal("draft"), // 보도자료 정리 중
  v.literal("matched"), // 기자 매칭 완료
  v.literal("review"), // 초안 검토(승인 게이트)
  v.literal("sending"), // 발송 진행
  v.literal("sent"), // 발송 완료
  v.literal("tracking"), // 게재 추적
  v.literal("done"),
);

export default defineSchema({
  ...authTables,

  // 사용자 프로필 / 발신 아이덴티티
  profiles: defineTable({
    userId: v.id("users"),
    companyName: v.string(),
    boilerplate: v.optional(v.string()), // 회사 한 줄 소개
    senderName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    plan: planValidator,
    gmailConnected: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  // OpenCrab 기자 온톨로지 캐시 (mailing_status: candidate)
  journalists: defineTable({
    name: v.string(),
    outlet: v.string(),
    email: v.string(),
    beatPrimary: v.string(),
    beatSecondary: v.array(v.string()),
    contactConfidence: confidenceValidator,
    referenceArticleCount: v.number(),
    topReferenceTitle: v.optional(v.string()),
    topReferenceUrl: v.optional(v.string()),
    mailingStatus: v.string(), // 항상 "candidate"
    source: v.optional(v.string()), // "opencrab" | "seed" | "manual"
  })
    .index("by_email", ["email"])
    .index("by_beat", ["beatPrimary"]),

  // 보도자료
  pressReleases: defineTable({
    userId: v.id("users"),
    title: v.string(),
    headlines: v.array(v.string()), // 헤드라인 3안
    body: v.string(), // 표준 본문
    topicTags: v.array(v.string()),
    who: v.optional(v.string()),
    newsValue: v.optional(v.string()),
    numbers: v.optional(v.string()),
    quote: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
    status: v.union(v.literal("draft"), v.literal("ready")),
  }).index("by_user", ["userId"]),

  // 배포 캠페인
  campaigns: defineTable({
    userId: v.id("users"),
    pressReleaseId: v.id("pressReleases"),
    name: v.string(),
    status: campaignStatusValidator,
    scheduledSendAt: v.optional(v.number()), // 예약 발송 시각(ms)
  })
    .index("by_user", ["userId"])
    .index("by_scheduled", ["scheduledSendAt"]),

  // 기자 매칭 결과 (적합도 점수 + 근거)
  matches: defineTable({
    campaignId: v.id("campaigns"),
    journalistId: v.id("journalists"),
    score: v.number(), // 0~100
    reason: v.string(),
    included: v.boolean(), // 승인 게이트에서 개별 제외 가능
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_journalist", ["campaignId", "journalistId"]),

  // 기자별 개인화 메일 초안
  emailDrafts: defineTable({
    campaignId: v.id("campaigns"),
    journalistId: v.id("journalists"),
    subject: v.string(),
    body: v.string(),
    gmailDraftId: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("published"),
    ),
    sentAt: v.optional(v.number()),
    scheduledSendAt: v.optional(v.number()),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_journalist", ["campaignId", "journalistId"])
    .index("by_status_scheduled", ["status", "scheduledSendAt"]),

  // 기자 회신 + 7유형 분류 + 답장 초안
  replies: defineTable({
    campaignId: v.id("campaigns"),
    journalistId: v.id("journalists"),
    type: replyTypeValidator,
    rawBody: v.string(),
    draftResponse: v.string(),
    handled: v.boolean(),
    interviewSlots: v.optional(v.array(v.string())), // 인터뷰 제안 3안
    interviewPickedSlot: v.optional(v.string()),
    interviewConfirmedAt: v.optional(v.number()),
  }).index("by_campaign", ["campaignId"]),

  // 억제 리스트(수신거부 영구 제외)
  suppressionList: defineTable({
    userId: v.id("users"),
    email: v.string(),
    reason: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_email", ["userId", "email"]),

  // 미디어킷
  mediaKits: defineTable({
    userId: v.id("users"),
    name: v.string(),
    boilerplate: v.optional(v.string()),
    keyMessages: v.array(v.string()),
    factSheet: v.array(v.object({ label: v.string(), value: v.string(), source: v.optional(v.string()) })),
    narrative: v.optional(v.string()),
    spokesperson: v.optional(v.string()),
    quotes: v.array(v.string()),
    contact: v.optional(v.string()),
    completeness: v.number(), // 0~100
  }).index("by_user", ["userId"]),

  // 사용량/요금 한도 (무료: 월 10통, 보도자료 3건 등)
  usage: defineTable({
    userId: v.id("users"),
    month: v.string(), // "YYYY-MM"
    sendsUsed: v.number(),
    pressReleasesUsed: v.number(),
  }).index("by_user_month", ["userId", "month"]),

  // BYO Gmail OAuth 토큰 (로그인용 AUTH_GOOGLE_* 와 별개)
  gmailAccounts: defineTable({
    userId: v.id("users"),
    email: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiryDate: v.optional(v.number()),
    scope: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // Gmail OAuth state (CSRF 방지)
  gmailOauthStates: defineTable({
    userId: v.id("users"),
    state: v.string(),
    createdAt: v.number(),
  }).index("by_state", ["state"]),
});
