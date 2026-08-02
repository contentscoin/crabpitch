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

/**
 * 발송 수단 — 예약 실행 시점에 "무엇을 할지"를 결정한다.
 *
 * `record_only`는 메일을 한 통도 보내지 않고 초안만 sent로 기록한다. 크랩피치 밖에서
 * 직접 보낸 사용자를 위한 경로이며, 명시적으로 선택해야만 쓸 수 있다.
 * `gmail_drafts`는 발송이 아니라 Gmail 초안 생성이다(사용자가 Gmail에서 최종 발송).
 * 기자 메일함으로 실제 메일이 나가는 것은 `smtp`뿐이다.
 */
export const sendModeValidator = v.union(
  v.literal("smtp"),
  v.literal("gmail_drafts"),
  v.literal("record_only"),
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
    /**
     * 사용자가 발신 아이덴티티를 **직접 저장한** 시각 — 온보딩 ①단계 판정 기준.
     *
     * 왜 별도 필드가 필요한가:
     *  - `companyName`·`senderName`·`contactEmail`은 `ensureProfile`가 자동으로 채운다
     *    (`user.name` 또는 리터럴 `"내 회사"`). 게다가 `AppShell`이 마운트마다 호출하므로
     *    로그인만 해도 행이 생긴다 → **필드 존재로는 "작성했는가"를 판정할 수 없다.**
     *  - `boilerplate`도 게이트로 쓸 수 없다. `ensureProfile`가 채우지 않는 건 맞지만
     *    **제품 어디에서도 읽히지 않는 필드**다(보도자료는 `mediaKits.boilerplate`를 쓴다).
     *    아무 효과 없는 값을 채워야 배너가 사라지는 게이트는 사용자를 납득시킬 수 없다.
     *
     * ⚠️ `updateProfile`만 이 값을 찍는다. `ensureProfile`는 절대 쓰지 않는다
     *    (가드 테스트가 고정한다) — 자동 완료가 되면 판정이 무의미해진다.
     *
     * 기존 사용자는 미완료로 보인다. 설정을 한 번 저장하면 닫히고, 그 행위 자체가
     * 온보딩이 요구하는 것이므로 백필하지 않는다.
     */
    profileConfirmedAt: v.optional(v.number()),
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

    /**
     * 사용자 메모 — 회신 내용·게재 이력·관계 맥락을 사람이 적어 두는 자리.
     *
     * ⚠️ 팩 동기화가 덮어쓰지 않는다(`opencrab.upsert`는 이 필드를 건드리지 않는다).
     *    날짜 도장을 찍어 줄바꿈으로 덧붙인다 — 덮어쓰면 이전 맥락이 사라진다.
     */
    notes: v.optional(v.string()),
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

  /** 플랫폼 운영 설정 — 관리자가 UI에서 바꾸는 소수의 전역 스위치. */
  platformSettings: defineTable({
    key: v.string(),
    boolValue: v.optional(v.boolean()),
    numberValue: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

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
    /** GEO: 최상단 3줄 요약 */
    keyTakeaways: v.optional(v.array(v.string())),
    /** GEO: 하단 Q&A (문항 수 규정은 팩에 없다 — 개수를 강제하지 않는다) */
    faq: v.optional(v.array(v.object({ q: v.string(), a: v.string() }))),
    /** 부제 2개(각 40자 이내) */
    subheads: v.optional(v.array(v.string())),
    /**
     * 인용문 화자 — 「이름 + 직함」 순서로 조립된다("홍길동 대표는 …").
     *
     * 이 두 필드가 없으면 메일 초안의 인용문이 화자 없이 「대표는 "…"라고 밝혔습니다」로
     * 나간다. `EmailContext`에는 원래 있던 필드인데 폼·스키마에 입력 경로가 없어
     * 한 번도 채워지지 않았다.
     */
    spokesName: v.optional(v.string()),
    spokesTitle: v.optional(v.string()),
  }).index("by_user", ["userId"]).index("by_client", ["agencyClientId"]),

  // 배포 캠페인
  campaigns: defineTable({
    userId: v.id("users"),
    pressReleaseId: v.id("pressReleases"),
    name: v.string(),
    status: campaignStatusValidator,
    scheduledSendAt: v.optional(v.number()), // 예약 발송 시각(ms)
    agencyClientId: v.optional(v.id("agencyClients")),
    /**
     * 예약 시각에 **무엇을 할지**.
     *
     * 이 필드가 없던 동안 예약 발송은 발신 수단과 무관하게 초안 상태만 sent로 바꿨다
     * (실행 함수가 internalMutation이라 외부 I/O가 구조적으로 불가능했다). SMTP를
     * 연결해 두고 예약해도 기자에게 메일이 한 통도 나가지 않았다.
     * 예약 시점에 수단을 확정해 저장하고, 실행 시점에는 그 수단의 액션을 디스패치한다.
     *
     * 레거시 예약(undefined)은 "record_only"로 취급한다 — 이미 그 동작을 전제로
     * 예약된 건을 실행 시점에 실발송으로 바꾸면 사용자가 동의하지 않은 발송이 된다.
     */
    sendMode: v.optional(sendModeValidator),
    /**
     * 예약 실행 디스패치 클레임 시각.
     *
     * 실발송은 액션이라 확정까지 시간이 걸린다. 그 사이 캠페인은 여전히
     * `status:"sending"` + 과거 `scheduledSendAt`이므로 매분 크론이 **같은 캠페인을
     * 다시 디스패치해 중복 발송**한다. 디스패치 직전에 이 값을 찍어 창을 닫는다.
     * 오래된 클레임(액션이 죽은 경우)은 `DISPATCH_STALE_MS` 뒤 재시도를 허용한다.
     */
    dispatchedAt: v.optional(v.number()),
    /**
     * 예약 실행 실패 사유.
     *
     * 예약 실행 시점에는 사용자가 화면에 없다 — 액션이 throw하면 아무도 모른다.
     * 실패를 여기 남겨 캠페인 화면에서 보이게 한다.
     */
    lastSendError: v.optional(v.string()),
    /**
     * 예약 실행 실패 횟수.
     *
     * 실패할 때마다 크론이 재시도하는데, 원인이 고쳐지지 않으면(예: 메일 비밀번호 변경)
     * **영구히 재시도**한다. 매 시도가 실제 SMTP 접속이므로 계정이 잠길 수도 있다.
     * 상한에 닿으면 예약을 해제하고 사용자가 개입하게 한다.
     */
    sendAttempts: v.optional(v.number()),
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
    /**
     * 이 초안을 만든 골격 — 프리셋 4종 또는 "custom".
     *
     * AI 개인화 단계가 이 값을 읽어 골격별 분량·구조 지시를 만든다. 없으면 모든 초안이
     * 표준 7블록 규칙으로 다듬어져 '데이터 중심'·'초간결' 선택이 무의미해진다.
     * 레거시 초안은 undefined — 읽는 쪽이 "standard"로 폴백한다.
     */
    templateKind: v.optional(
      v.union(
        v.literal("standard"),
        v.literal("data"),
        v.literal("story"),
        v.literal("brief"),
        v.literal("custom"),
        // 팔로업은 프리셋과 다른 별도 골격이다(원본 프리셋을 상속하지 않는다).
        v.literal("followup"),
      ),
    ),
    /** 메일 컴플라이언스 게이트 판정: "pass" | "warn" | "fail" */
    complianceLevel: v.optional(v.string()),
    /** 위반 요약(사용자 노출용 한글 문구) + 발송 제외 사유 */
    complianceNotes: v.optional(v.array(v.string())),
    /** 이 초안이 어떤 초안의 팔로업인지 — 재탕 검증·이력 추적용 */
    followUpOf: v.optional(v.id("emailDrafts")),
    /**
     * 사용자가 이 초안을 실제로 열어 확인한 시각.
     * 캠페인 전체 발송 전에 최소 1건은 이 기록이 있어야 한다(파일럿 게이트).
     */
    approvedAt: v.optional(v.number()),
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
    /** 게재 통보에 대해 정정을 요청한 시각 */
    correctionRequestedAt: v.optional(v.number()),
    /** 정정 요청 내용(무엇이 어떻게 틀렸는지) */
    correctionNote: v.optional(v.string()),
    /**
     * 보류 회신 뒤 재접근 가능 여부 — 사용자가 직접 판단해 기록한다.
     * false면 이 사용자의 이후 매칭에서 해당 기자를 제외한다(수신거부와는 다른 축이다).
     */
    reapproachOk: v.optional(v.boolean()),
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
    /** ① 한 문장 회사 정의 */
    oneLiner: v.optional(v.string()),
    /** ⑥ 비주얼 자산 — GEO 파일명·Alt·캡션 규칙을 따른다 */
    visuals: v.optional(
      v.array(
        v.object({
          label: v.string(),
          url: v.optional(v.string()),
          alt: v.optional(v.string()),
          caption: v.optional(v.string()),
        }),
      ),
    ),
    /** ⑨ 자산 사용 규정 4항 */
    assetPolicy: v.optional(
      v.object({
        usageScope: v.optional(v.string()),
        modificationLimits: v.optional(v.string()),
        credit: v.optional(v.string()),
        trademarkContact: v.optional(v.string()),
      }),
    ),
    /** ⑦ 최근 보도 */
    coverage: v.optional(
      v.array(
        v.object({
          outlet: v.string(),
          title: v.string(),
          url: v.optional(v.string()),
          publishedAtText: v.optional(v.string()),
        }),
      ),
    ),
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

  /**
   * 사용자 SMTP 발신 계정 — Gmail OAuth를 쓸 수 없는 사용자의 발송 경로.
   *
   * OAuth 앱 검수는 우리가 끝내야 하는 일이고 사용자 수에 상한이 걸린다. SMTP는
   * 제공자를 가리지 않고 오늘 당장 붙는다. 두 경로 모두 **같은 발송 게이트**를 통과한다.
   *
   * ⚠️ `passwordSealed`는 반드시 `lib/secretBox`로 봉인된 값이다(평문 금지).
   *    Gmail 앱 비밀번호는 IMAP까지 열려 있어 DB 유출만으로 과거 메일이 통째로 읽힌다.
   *    클라이언트로 나가는 쿼리는 이 필드를 절대 포함하지 않는다.
   */
  smtpAccounts: defineTable({
    userId: v.id("users"),
    /** 발신 주소. 로그인 ID와 다를 수 있어 `username`을 따로 둔다. */
    email: v.string(),
    /** 수신자에게 보이는 이름. 비우면 이메일만 보인다. */
    fromName: v.optional(v.string()),
    // lib/smtpProviders 의 SmtpProviderId 와 같은 집합을 유지한다.
    provider: v.union(
      v.literal("gmail"),
      v.literal("naver"),
      v.literal("daum"),
      v.literal("outlook"),
      v.literal("custom"),
    ),
    host: v.string(),
    port: v.number(),
    /** true = 접속부터 TLS(465), false = STARTTLS 승격(587) */
    secure: v.boolean(),
    /** 로그인 ID가 발신 주소와 다른 경우에만 채운다. */
    username: v.optional(v.string()),
    /** `v1.{iv}.{ciphertext}` — 원문은 어떤 경로로도 저장하지 않는다. */
    passwordSealed: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** 마지막 연결 테스트/발송 결과 — 설정 화면이 "연결됨"을 단정하지 않게 한다. */
    lastStatus: v.optional(v.union(v.literal("ok"), v.literal("error"))),
    lastError: v.optional(v.string()),
    lastCheckedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

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
    /**
     * ⚠️ 레거시 평문 컬럼 — 신규 저장은 `apiKeySealed`에만 쓴다.
     *
     * 남겨 두는 이유는 이미 저장된 키로 계속 호출이 되어야 하기 때문이다(읽기 폴백).
     * 사용자가 키를 다시 저장하면 봉인 컬럼으로 옮겨지고 이 값은 지워진다.
     */
    apiKey: v.optional(v.string()),
    /**
     * AES-256-GCM으로 봉인한 API 키(`secretBox`).
     *
     * 해시가 아니라 봉인인 이유: 호출 시점에 **원문을 프로바이더로 보내야** 한다.
     * SMTP 비밀번호(`smtpAccounts.passwordSealed`)와 같은 등급의 비밀인데 한쪽만
     * 평문이던 정책 비대칭을 없앤다.
     */
    apiKeySealed: v.optional(v.string()),
    /**
     * 화면 표시용 마스킹 문자열(비밀 아님).
     *
     * 저장 시점에 만들어 둔다 — 그러지 않으면 목록을 그릴 때마다 키를 복호화해야 하고,
     * 원문을 다루는 지점이 불필요하게 늘어난다.
     */
    keyMasked: v.optional(v.string()),
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
