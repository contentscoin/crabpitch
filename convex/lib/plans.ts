/** 요금제별 한도 — 기획서 6.3 요금제 표. (무료: 월 10통, 보도자료 3건, 매칭 발송 후보 3명) */

export type Plan = "free" | "solo" | "growth" | "agency";

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
  free: {
    label: "Free",
    price: 0,
    sends: 10,
    pressReleases: 3,
    matchReveal: 3,
    mediaKits: 1,
    mcp: false,
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

export function planAllowsMcp(plan: Plan | string | undefined): boolean {
  if (!plan || !(plan in PLAN_LIMITS)) return false;
  return PLAN_LIMITS[plan as Plan].mcp;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
