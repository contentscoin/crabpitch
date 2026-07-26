import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_MAX,
  COMPLETENESS_TARGETS,
  computeCompleteness,
  scoreMediaKit,
  unmetItems,
  type CompletenessKey,
  type MediaKitScorable,
} from "./mediaKitCompleteness";
import { WRITING_RULES } from "./pressGuide";

/** 팩 기준(80~120단어)을 만족하는 보일러플레이트. 상수를 복제하지 않고 길이를 맞춘다. */
function boilerplateOf(words: number): string {
  return Array.from({ length: words }, (_, i) => `소개어절${i}`).join(" ");
}

const EMPTY: MediaKitScorable = { keyMessages: [], factSheet: [], quotes: [] };

const FULL: MediaKitScorable = {
  boilerplate: boilerplateOf(WRITING_RULES.boilerplateWordMin + 10),
  keyMessages: ["처리 시간을 30% 줄인다", "중소 브랜드도 쓸 수 있다", "국내 물류사와 연동한다"],
  factSheet: [
    { label: "설립", value: "2019년", source: "법인등기부" },
    { label: "누적 고객사", value: "1,200곳", source: "2026년 6월 자사 집계" },
    { label: "본사", value: "서울 성동구" },
  ],
  narrative: "창고 자동화 현장에서 겪은 문제를 풀기 위해 창업했다.",
  spokesperson: "김대표 대표이사 — 물류 IT 15년",
  quotes: ["제품 관련 인용", "비전 관련 인용", "시장 관련 인용"],
  contact: "홍보팀 이담당 / press@example.com / 02-000-0000",
};

function earnedOf(kit: MediaKitScorable, key: CompletenessKey): number {
  const found = scoreMediaKit(kit).items.find((i) => i.key === key);
  if (!found) throw new Error(`항목 없음: ${key}`);
  return found.earned;
}

function reasonOf(kit: MediaKitScorable, key: CompletenessKey): string | undefined {
  return scoreMediaKit(kit).items.find((i) => i.key === key)?.reason;
}

describe("mediaKitCompleteness", () => {
  it("배점 합계가 100이다", () => {
    expect(COMPLETENESS_MAX).toBe(100);
    expect(scoreMediaKit(EMPTY).items.reduce((s, i) => s + i.max, 0)).toBe(100);
  });

  it("빈 킷은 0점이고 모든 항목에 사유가 붙는다", () => {
    const report = scoreMediaKit(EMPTY);
    expect(report.score).toBe(0);
    expect(report.items.every((i) => i.earned === 0)).toBe(true);
    expect(report.items.every((i) => !!i.reason)).toBe(true);
  });

  it("완전한 킷은 100점이고 사유가 하나도 없다", () => {
    const report = scoreMediaKit(FULL);
    expect(report.score).toBe(100);
    expect(unmetItems(report)).toHaveLength(0);
  });

  it("computeCompleteness는 총점만 좁혀 준다", () => {
    expect(computeCompleteness(FULL)).toBe(100);
    expect(computeCompleteness(EMPTY)).toBe(0);
  });

  /* ── placeholder ──────────────────────────────────────────── */

  it("placeholder가 남은 필드는 미완성으로 센다", () => {
    const withPlaceholder: MediaKitScorable = {
      ...FULL,
      narrative: `창업 배경 ${WRITING_RULES.unverifiablePlaceholder}`,
    };
    expect(earnedOf(withPlaceholder, "narrative")).toBe(0);
    // 축 하나가 비면 균형 보정도 함께 빠진다.
    expect(earnedOf(withPlaceholder, "balance")).toBe(0);
    expect(reasonOf(withPlaceholder, "narrative")).toContain(WRITING_RULES.unverifiablePlaceholder);
  });

  it("TBD·확정 필요도 placeholder로 본다", () => {
    expect(earnedOf({ ...FULL, spokesperson: "TBD" }, "spokesperson")).toBe(0);
    expect(earnedOf({ ...FULL, spokesperson: "tbd" }, "spokesperson")).toBe(0);
    expect(earnedOf({ ...FULL, narrative: "연혁 확정 필요" }, "narrative")).toBe(0);
  });

  it("placeholder가 섞인 핵심 메시지는 개수에서 빠진다", () => {
    const kit: MediaKitScorable = {
      ...FULL,
      keyMessages: ["처리 시간을 30% 줄인다", WRITING_RULES.unverifiablePlaceholder, "  "],
    };
    // 유효 1/3 → 15점 중 5점.
    expect(earnedOf(kit, "keyMessages")).toBe(5);
  });

  /* ── 팩트시트 출처 충족률 ─────────────────────────────────── */

  it("수치 항목의 source 충족률이 점수에 반영된다", () => {
    const half: MediaKitScorable = {
      ...FULL,
      factSheet: [
        { label: "설립", value: "2019년", source: "법인등기부" },
        { label: "누적 고객사", value: "1,200곳" },
        { label: "본사", value: "서울 성동구" },
      ],
    };
    // 수치 항목 2개 중 1개만 출처 → 10점 중 5점. 팩트시트 개수 점수는 그대로.
    expect(earnedOf(half, "factSource")).toBe(5);
    expect(earnedOf(half, "factSheet")).toBe(10);
    expect(reasonOf(half, "factSource")).toContain("출처");
  });

  it("source가 placeholder면 출처로 인정하지 않는다", () => {
    const kit: MediaKitScorable = {
      ...FULL,
      factSheet: [{ label: "누적 고객사", value: "1,200곳", source: WRITING_RULES.unverifiablePlaceholder }],
    };
    expect(earnedOf(kit, "factSource")).toBe(0);
  });

  it("수치가 없는 팩트시트는 출처 점수를 받지 못한다", () => {
    const kit: MediaKitScorable = {
      ...FULL,
      factSheet: [
        { label: "본사", value: "서울 성동구" },
        { label: "사업 영역", value: "물류 자동화" },
        { label: "대표 서비스", value: "크랩로지스" },
      ],
    };
    expect(earnedOf(kit, "factSheet")).toBe(10);
    expect(earnedOf(kit, "factSource")).toBe(0);
    expect(reasonOf(kit, "factSource")).toContain("수치");
  });

  /* ── 개수·형식 항목 ───────────────────────────────────────── */

  it("개수 항목은 목표치 대비 부분 점수를 준다", () => {
    const partial: MediaKitScorable = { ...FULL, quotes: ["제품 관련 인용"] };
    expect(COMPLETENESS_TARGETS.quotes).toBe(3);
    expect(earnedOf(partial, "quotes")).toBe(3);
    expect(reasonOf(partial, "quotes")).toContain("1/3");
  });

  it("보일러플레이트는 존재와 분량을 나눠 채점한다", () => {
    const short: MediaKitScorable = { ...FULL, boilerplate: "짧은 회사 소개" };
    expect(earnedOf(short, "boilerplate")).toBe(10);
    expect(earnedOf(short, "boilerplateLength")).toBe(0);
    expect(reasonOf(short, "boilerplateLength")).toContain(`${WRITING_RULES.boilerplateWordMin}`);

    const long: MediaKitScorable = { ...FULL, boilerplate: boilerplateOf(WRITING_RULES.boilerplateWordMax + 1) };
    expect(earnedOf(long, "boilerplateLength")).toBe(0);
    expect(reasonOf(long, "boilerplateLength")).toContain("줄이면");
  });

  it("연락처에 이메일이 없으면 형식 점수만 빠진다", () => {
    const noEmail: MediaKitScorable = { ...FULL, contact: "홍보팀 이담당 / 02-000-0000" };
    expect(earnedOf(noEmail, "contact")).toBe(5);
    expect(earnedOf(noEmail, "contactEmail")).toBe(0);
    expect(scoreMediaKit(noEmail).score).toBe(95);
  });

  /* ── 균형 보정·사유 노출 ─────────────────────────────────── */

  it("모든 축이 최소 1개씩 차면 균형 보정을 준다", () => {
    const minimal: MediaKitScorable = {
      boilerplate: "회사 소개 한 줄",
      keyMessages: ["핵심 메시지 하나"],
      factSheet: [{ label: "설립", value: "2019년" }],
      narrative: "창업 배경",
      spokesperson: "김대표 대표이사",
      quotes: ["인용문 하나"],
      contact: "홍보팀 / press@example.com",
    };
    expect(earnedOf(minimal, "balance")).toBe(10);

    const oneAxisMissing: MediaKitScorable = { ...minimal, quotes: [] };
    expect(earnedOf(oneAxisMissing, "balance")).toBe(0);
    expect(reasonOf(oneAxisMissing, "balance")).toContain("인용문");
  });

  it("미충족 항목은 점수 손실이 큰 순으로 사유를 준다", () => {
    const unmet = unmetItems(scoreMediaKit(EMPTY));
    expect(unmet[0].key).toBe("keyMessages"); // 15점으로 손실이 가장 크다
    expect(unmet.every((i) => (i.reason ?? "").length > 0)).toBe(true);
  });
});
