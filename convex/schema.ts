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
    activeAgencyId: v.optional(v.id("agencies")),
    activeClientId: v.optional(v.id("agencyClients")),
    /** BYO AI: 사용자가 스킬을 실행할 기본 제공자 */
    preferredAiProvider: v.optional(
      v.union(v.literal("claude"), v.literal("chatgpt"), v.literal("gemini")),
    ),
    /** 웹앱 안 AI 실행(보도문 다듬기·메일 개인화)에 쓸 기본 LLM 프로바이더 */
    preferredLlmProvider: v.optional(
      v.union(v.literal("anthropic"), v.literal("openai"), v.literal("gemini")),
    ),
    /** 플랫폼 운영자 (에이전시 admin과 별개) */
    isPlatformAdmin: v.optional(v.boolean()),
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

    /* ── 오픈크랩 기자단 팩 동기화 필드 (전부 optional — 기존 seed/manual 레코드 호환) ── */
    /** 네이버 뉴스 언론사 OID — 매체 유형(outletCategory) 도출 키 */
    naverOid: v.optional(v.string()),
    /** 연락처 검증 상태(팩 원문): "verified" | "inferred" 등 */
    contactVerification: v.optional(v.string()),
    /** 연락처 근거 개수 — 신뢰도 가중(S4) 입력 */
    contactEvidenceCount: v.optional(v.number()),
    /** ⚠️ 감사 전용 — UI·MCP 응답에 절대 노출하지 않는다 */
    contactSourceUrls: v.optional(v.array(v.string())),
    /** beat 분포(합 1.0 근사) — 매칭·개인화 앵글 선택에 사용 */
    beatDistribution: v.optional(
      v.array(v.object({ beat: v.string(), weight: v.number() })),
    ),
    /** 팩의 beat 분류 신뢰도: "high" | "medium" | "low" */
    classificationConfidence: v.optional(v.string()),
    /** 근거 기사 최대 3건 — topReferenceTitle/Url은 첫 항목(하위 호환) */
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
    /** referenceArticles의 publishedAt 최댓값 — 데이터 신선도 기준 */
    latestArticleAt: v.optional(v.number()),
    /** naverOid 정적 매핑 결과: "newswire" | "it" | "economy" | "general" */
    outletCategory: v.optional(v.string()),

    /* 동기화 메타 */
    packPackageId: v.optional(v.string()),
    packBatch: v.optional(v.string()),
    /** 이 레코드를 팩에서 마지막으로 반입한 시각 */
    packSyncedAt: v.optional(v.number()),
    /** 팩 목록에서 마지막으로 확인된 시각 — stale(이직·퇴사 추정) 판정 기준 */
    lastSeenInPackAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_beat", ["beatPrimary"]),

  /** 오픈크랩 팩 레지스트리 — 목록 완주 결과(진실 원천). packRegistry 상수는 부트스트랩·폴백. */
  opencrabPacks: defineTable({
    packageId: v.string(),
    /** "journalist-contacts" | "journalist-reference" | "pr-presskit" | "other" */
    series: v.string(),
    /** batch-001 … batch-026 (기자단 배치 팩만) */
    batch: v.optional(v.string()),
    name: v.optional(v.string()),
    /** 팩이 선언한 레코드 수 — 결손(partial) 판정 기준 */
    recordCount: v.optional(v.number()),
    /** 팩 스냅샷 시각(원문 문자열) */
    capturedAt: v.optional(v.string()),
    /** content_bytes + record_count 기반 지문 — 변경 감지(version 필드는 1.0.0 고정이라 신뢰하지 않음) */
    fingerprint: v.optional(v.string()),
    /** 동기화 대상 여부 — 신규 시리즈는 기본 false(관리자 승인 후 전환) */
    syncEnabled: v.boolean(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
  }).index("by_packageId", ["packageId"]).index("by_series", ["series"]),

  /** 팩 동기화 실행 기록 — 팩 1개 단위 커밋(실패 격리)의 감사 로그. */
  packSyncRuns: defineTable({
    packageId: v.string(),
    /** "ok" | "partial" | "failed" */
    status: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    /** 팩이 선언한 레코드 수 */
    recordCount: v.optional(v.number()),
    /** 실제 파싱 성공 건수 */
    fetched: v.number(),
    inserted: v.number(),
    updated: v.number(),
    /** ⚠️ 저장 전 이메일 마스킹 필수(F6) */
    error: v.optional(v.string()),
    trigger: v.string(), // "cron" | "manual"
  })
    .index("by_packageId", ["packageId"])
    .index("by_startedAt", ["startedAt"]),

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
    agencyClientId: v.optional(v.id("agencyClients")),
    /** 엠바고 해제 시각(ms) — 있으면 메일 최상단·자료 블록에 이중 표기 */
    embargoAt: v.optional(v.number()),
  }).index("by_user", ["userId"]).index("by_client", ["agencyClientId"]),

  // 배포 캠페인
  campaigns: defineTable({
    userId: v.id("users"),
    pressReleaseId: v.id("pressReleases"),
    name: v.string(),
    status: campaignStatusValidator,
    scheduledSendAt: v.optional(v.number()), // 예약 발송 시각(ms)
    agencyClientId: v.optional(v.id("agencyClients")),
  })
    .index("by_user", ["userId"])
    .index("by_scheduled", ["scheduledSendAt"])
    .index("by_client", ["agencyClientId"]),

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
    /**
     * 캠페인에서 비정규화한 소유자 — 쿨다운을 **사용자 단위**로 판정하기 위한 축.
     * 사용자 축 없는 전역 by_journalist 인덱스는 만들지 않는다(교차 테넌트 스캔·
     * "다른 누군가가 이 기자에게 최근 발송했다" 사이드채널을 구조적으로 차단).
     * 기존 레코드는 undefined 허용 — 조회 측에서 캠페인 조인으로 폴백한다.
     */
    userId: v.optional(v.id("users")),
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
    /** 메일 컴플라이언스 게이트 판정: "pass" | "warn" | "fail" */
    complianceLevel: v.optional(v.string()),
    /** 위반 요약(사용자 노출용 한글 문구) + 발송 제외 사유 */
    complianceNotes: v.optional(v.array(v.string())),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_journalist", ["campaignId", "journalistId"])
    .index("by_user_journalist", ["userId", "journalistId"])
    .index("by_status_scheduled", ["status", "scheduledSendAt"]),

  // 기자 회신 + 7유형 분류 + 답장 초안
  replies: defineTable({
    campaignId: v.id("campaigns"),
    journalistId: v.id("journalists"),
    type: replyTypeValidator,
    rawBody: v.string(),
    draftResponse: v.string(),
    /** 적용된 응대 템플릿 변형 id (기본 "default") */
    templateVariant: v.optional(v.string()),
    handled: v.boolean(),
    interviewSlots: v.optional(v.array(v.string())), // 인터뷰 제안 3안
    interviewPickedSlot: v.optional(v.string()),
    interviewConfirmedAt: v.optional(v.number()),
    /** question 하위 5분류: "numbers" | "competitor" | "intent" | "roadmap" | "negative" */
    questionSubtype: v.optional(v.string()),
    /** complaint·negative 등 담당자 직접 확인이 필요한 회신 */
    needsEscalation: v.optional(v.boolean()),
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

  // Agency 멀티테넌트 — PR 대행사 워크스페이스
  agencies: defineTable({
    name: v.string(),
    ownerUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_owner", ["ownerUserId"]),

  agencyMembers: defineTable({
    agencyId: v.id("agencies"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  })
    .index("by_agency", ["agencyId"])
    .index("by_user", ["userId"])
    .index("by_agency_user", ["agencyId", "userId"]),

  agencyClients: defineTable({
    agencyId: v.id("agencies"),
    name: v.string(),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_agency", ["agencyId"]),

  // Agency REST API 키 (원문은 생성 시 1회만 반환, 해시만 저장)
  agencyApiKeys: defineTable({
    agencyId: v.id("agencies"),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    createdAt: v.number(),
    revoked: v.boolean(),
  })
    .index("by_agency", ["agencyId"])
    .index("by_hash", ["keyHash"]),

  // 사용자 커스텀 메일 템플릿 — {{자리표시자}} 기반 제목/본문
  userEmailTemplates: defineTable({
    userId: v.id("users"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // 사용자 본인 LLM API 키(BYOK) — GPT·Claude·Gemini를 웹앱에서 직접 실행
  // 원문 키는 서버 함수에서만 사용하고 클라이언트에는 마스킹만 반환한다.
  userAiKeys: defineTable({
    userId: v.id("users"),
    provider: v.union(
      v.literal("anthropic"),
      v.literal("openai"),
      v.literal("gemini"),
    ),
    apiKey: v.string(),
    model: v.optional(v.string()), // 미설정 시 프로바이더 기본 모델
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    lastStatus: v.optional(v.union(v.literal("ok"), v.literal("error"))),
    lastError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  // 유저별 MCP 키 (유료 플랜 전용) — Claude/ChatGPT/Gemini 플러그인 등록용
  userMcpKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revoked: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["keyHash"]),
});
