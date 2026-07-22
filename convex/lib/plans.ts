/** 요금제별 한도 — 기획서 6.3 요금제 표. (무료: 월 10통, 보도자료 3건, 매칭 이메일 3명 공개) */

export type Plan = "free" | "solo" | "growth" | "agency";

export interface PlanLimits {
  label: string;
  price: number; // 원/월
  sends: number; // 월 발송 통수
  pressReleases: number; // 월 보도자료 작성 건수
  matchReveal: number; // 매칭 결과 이메일 공개 인원 (초과분 블러)
  mediaKits: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { label: "Free", price: 0, sends: 10, pressReleases: 3, matchReveal: 3, mediaKits: 1 },
  solo: { label: "Solo", price: 19000, sends: 100, pressReleases: 9999, matchReveal: 9999, mediaKits: 3 },
  growth: { label: "Growth", price: 49000, sends: 500, pressReleases: 99999, matchReveal: 99999, mediaKits: 99999 },
  agency: { label: "Agency", price: 149000, sends: 1_000_000, pressReleases: 999999, matchReveal: 999999, mediaKits: 999999 },
};

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
