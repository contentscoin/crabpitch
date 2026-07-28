/**
 * 요금제별 한도·기능 권한.
 *
 * ⚠️ 두 경로의 정책이 **다르다.**
 *    - **웹앱**: 무료도 매칭·발송·미디어킷을 쓴다(`PLAN_LIMITS`의 수치 한도만 적용).
 *    - **MCP**: 무료는 **보도자료 작성 계열만**(`SKILL_ENTITLEMENTS`).
 *
 *    MCP를 더 좁게 잡는 이유는 그쪽이 자동화 경로이기 때문이다. 웹앱은 사람이 화면을 보며
 *    한 건씩 승인하지만, MCP는 에이전트가 반복 호출한다 — 기자단 데이터와 발송 인프라를
 *    무료로 자동화 대상에 올려 두면 남용 비용이 곧바로 커진다.
 */

export type Plan = "free" | "solo" | "growth" | "agency";

/**
 * 스킬 = 제품 기능 단위. MCP 도구와 공개 스킬 팩이 이 이름을 공유한다.
 * 이름은 `crabpitch-skill` 저장소의 디렉터리명과 일치해야 한다.
 */
export const SKILL_IDS = [
  "press-release-writer",
  "media-kit-builder",
  "journalist-outreach",
  "reply-handler",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

/**
 * **MCP 경로**의 플랜별 사용 가능 스킬 — 이 표가 단일 소스다.
 *
 * 무료가 보도자료 작성만 열려 있는 이유: 보도자료는 사용자가 자기 원고를 쓰는 일이라
 * 기자 데이터도, 발송 인프라도 건드리지 않는다. 나머지 셋은 그렇지 않다.
 *
 * ⚠️ 웹앱에는 적용하지 않는다. 웹앱의 무료 범위는 `PLAN_LIMITS`의 수치 한도가 정한다.
 */
export const SKILL_ENTITLEMENTS: Record<Plan, readonly SkillId[]> = {
  free: ["press-release-writer"],
  solo: SKILL_IDS,
  growth: SKILL_IDS,
  agency: SKILL_IDS,
};

export interface PlanLimits {
  label: string;
  price: number; // 원/월
  sends: number; // 월 발송 통수
  pressReleases: number; // 월 보도자료 작성 건수
  matchReveal: number; // 매칭 결과 발송 후보 인원 (초과분 잠금 — 이메일·실명은 어느 플랜에서도 비노출)
  mediaKits: number;
  /** Claude/ChatGPT/Gemini MCP 플러그인 키 발급·호출 */
  mcp: boolean;
  /**
   * 캠페인 1건당 발송 통수 상한 — 월 한도와 **별개**.
   * 한 번에 수백 통을 뿌리는 대량발송을 구조적으로 막는 컴플라이언스 장치이며,
   * 예약·즉시·크론 백업 3경로 모두에서 서버가 재검증한다.
   */
  campaignSendCap: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  // ⚠️ 웹앱 한도는 그대로다 — 무료 사용자도 웹에서는 매칭·발송·미디어킷을 쓴다.
  //    무료 제한은 **MCP 경로에만** 적용된다(SKILL_ENTITLEMENTS).
  free: {
    label: "Free",
    price: 0,
    sends: 10,
    pressReleases: 3,
    matchReveal: 3,
    mediaKits: 1,
    // MCP 키 발급 자체는 무료도 가능하다. 다만 도구는 보도자료 작성 계열만 열린다.
    mcp: true,
    campaignSendCap: 10,
  },
  solo: {
    label: "Solo",
    price: 19000,
    sends: 100,
    pressReleases: 9999,
    matchReveal: 9999,
    mediaKits: 3,
    mcp: true,
    campaignSendCap: 50,
  },
  growth: {
    label: "Growth",
    price: 49000,
    sends: 500,
    pressReleases: 99999,
    matchReveal: 99999,
    mediaKits: 99999,
    mcp: true,
    campaignSendCap: 150,
  },
  agency: {
    label: "Agency",
    price: 149000,
    sends: 1_000_000,
    pressReleases: 999999,
    matchReveal: 999999,
    mediaKits: 999999,
    mcp: true,
    campaignSendCap: 300,
  },
};

export function isPaidPlan(plan: Plan | string | undefined): boolean {
  return plan === "solo" || plan === "growth" || plan === "agency";
}

/** 알 수 없는 값은 무료로 떨어뜨린다 — 권한 판정은 실패 시 좁은 쪽으로 간다. */
function normalizePlan(plan: Plan | string | undefined): Plan {
  return plan && plan in PLAN_LIMITS ? (plan as Plan) : "free";
}

/** 이 플랜이 MCP에서 해당 스킬을 쓸 수 있는가. MCP 권한 판정의 단일 진입점. */
export function planAllowsSkill(plan: Plan | string | undefined, skill: SkillId): boolean {
  return SKILL_ENTITLEMENTS[normalizePlan(plan)].includes(skill);
}

/** 이 플랜이 MCP에서 쓸 수 있는 스킬 목록 — `crabpitch_status`가 그대로 돌려준다. */
export function skillsForPlan(plan: Plan | string | undefined): SkillId[] {
  return [...SKILL_ENTITLEMENTS[normalizePlan(plan)]];
}

/** MCP 도구별 담당 스킬 — 도구를 늘리면 여기에 함께 등록해야 게이트가 걸린다. */
export const MCP_TOOL_SKILL: Record<string, SkillId> = {
  crabpitch_press_guide: "press-release-writer",
  crabpitch_match_journalists: "journalist-outreach",
  crabpitch_email_template: "journalist-outreach",
  crabpitch_classify: "reply-handler",
  // crabpitch_status는 게이트 대상이 아니다 — 무엇이 잠겼는지 알려 주는 도구다.
  // crabpitch_mail_setup도 게이트하지 않는다 — 무료 사용자도 웹앱에서 발송할 수 있고,
  // 그러려면 메일 계정을 연결해야 한다. 설정을 막으면 잠긴 건 발송이 아니라 온보딩이다.
};

/**
 * 유료 전용 기능에 무료 사용자가 닿았을 때의 안내 문구.
 * **웹앱으로 우회할 수 있다는 사실을 반드시 함께 알린다** — 기능이 사라진 게 아니다.
 */
export function upgradeRequiredMessage(skill: SkillId): string {
  const label: Record<SkillId, string> = {
    "press-release-writer": "보도자료 작성",
    "media-kit-builder": "미디어킷",
    "journalist-outreach": "기자 매칭·메일 템플릿",
    "reply-handler": "회신 분류",
  };
  return `${label[skill]}은(는) MCP에서 유료 플랜 전용입니다. 무료 플랜은 MCP에서 보도자료 작성(crabpitch_press_guide)만 쓸 수 있습니다. 이 기능은 CrabPitch 웹앱에서는 무료로도 이용할 수 있고, Solo 이상으로 업그레이드하면 MCP에서도 열립니다.`;
}

/**
 * Gmail 연동(BYO-Email)은 **Agency 전용**이다.
 *
 * 발송 자체가 유료 기능이라는 뜻이 아니다 — 다른 플랜은 SMTP로 **똑같이** 보낸다.
 * 게이트(파일럿 승인·수신거부·쿨다운·표현 규정·상한·월 한도)도 두 경로가 공유한다.
 * 잠기는 것은 전송 수단 하나이지 발송 기능이 아니다.
 *
 * Gmail 경로만 따로 떼는 이유는 비용 구조가 다르기 때문이다. Gmail API는 제한 스코프라
 * 우리가 Google 검수를 받고 유지해야 하고, 미검수 상태에서는 연결 사용자 수에 상한이
 * 걸린다. 검수 대상 사용자를 좁히지 않으면 상한을 무엇에 쓸지 우리가 못 고른다.
 * SMTP는 그런 제약이 없어 모든 플랜에 열어 둔다.
 */
export const GMAIL_OAUTH_PLAN: Plan = "agency";

/**
 * ⚠️ 연결 시점만 보지 말고 **쓰는 시점마다** 다시 물어야 한다.
 *    Agency에서 내려온 사용자의 계정 문서는 그대로 남아 있어서, 연결 시점 검사만으로는
 *    다운그레이드 후에도 계속 발송된다.
 */
export function planAllowsGmailOAuth(plan: Plan | string | undefined): boolean {
  return normalizePlan(plan) === GMAIL_OAUTH_PLAN;
}

/** 막을 때는 대안을 함께 준다 — 발송이 막힌 게 아니라 수단 하나가 잠긴 것이다. */
export function gmailOAuthUpgradeMessage(): string {
  return (
    `Gmail 연동(BYO-Email)은 ${PLAN_LIMITS[GMAIL_OAUTH_PLAN].label} 플랜 전용입니다. ` +
    "다른 플랜에서는 설정 → 발신 메일(SMTP)로 Gmail·네이버·다음·회사 메일 어디서든 발송할 수 있고, " +
    "승인·수신거부·쿨다운·표현 규정·발송 한도는 두 경로가 똑같이 적용됩니다."
  );
}

export function planAllowsMcp(plan: Plan | string | undefined): boolean {
  if (!plan || !(plan in PLAN_LIMITS)) return false;
  return PLAN_LIMITS[plan as Plan].mcp;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
