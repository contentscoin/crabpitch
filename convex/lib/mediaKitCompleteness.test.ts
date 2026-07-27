import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_MAX,
  COMPLETENESS_TARGETS,
  computeCompleteness,
  followsAssetFilenameRule,
  LEGACY_COMPLETENESS_MAX,
  pressKitSection,
  scoreMediaKit,
  unmetItems,
  V2_COMPLETENESS_MAX,
  V2_KEYS,
  type CompletenessKey,
  type MediaKitScorable,
} from "./mediaKitCompleteness";
import { ASSET_POLICY_ITEMS, GEO_ASSET_RULES, PRESS_KIT_SECTIONS, WRITING_RULES } from "./pressGuide";

/** 팩 기준(80~120단어)을 만족하는 보일러플레이트. 상수를 복제하지 않고 길이를 맞춘다. */
function boilerplateOf(words: number): string {
  return Array.from({ length: words }, (_, i) => `소개어절${i}`).join(" ");
}

const EMPTY: MediaKitScorable = { keyMessages: [], factSheet: [], quotes: [] };

/** v1 시절 만점이던 킷 — v2에서 신규 4섹션이 비어 있는 **기존 사용자**의 모습이다. */
const LEGACY_FULL: MediaKitScorable = {
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

const FULL: MediaKitScorable = {
  ...LEGACY_FULL,
  oneLiner: "크랩로지스는 중소 물류사를 위한 창고 자동화 소프트웨어를 만드는 회사다.",
  visuals: [
    {
      label: "로고",
      url: "https://cdn.example.com/크랩로지스-크랩WMS-창고자동화.png",
      alt: "크랩로지스 로고",
      caption: "크랩로지스 국문 로고",
    },
  ],
  assetPolicy: {
    usageScope: "보도 목적에 한해 사용할 수 있습니다.",
    modificationLimits: "로고 비율·색상 변경을 금지합니다.",
    credit: "사진 사용 시 '크랩로지스 제공'을 표기해 주세요.",
    trademarkContact: "상표 사용 문의 press@example.com",
  },
  coverage: [{ outlet: "물류신문", title: "크랩로지스, 창고 자동화 SW 공개", url: "https://example.com/a" }],
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

  /* ── v2 배점 개편의 하락 완화 ─────────────────────────────── */

  it("신규 항목은 합계 V2_COMPLETENESS_MAX만 가져가고 나머지는 기존 항목이 유지한다", () => {
    expect(V2_COMPLETENESS_MAX + LEGACY_COMPLETENESS_MAX).toBe(COMPLETENESS_MAX);
    const maxOf = (key: CompletenessKey) => scoreMediaKit(EMPTY).items.find((i) => i.key === key)!.max;
    expect(V2_KEYS.reduce((s, k) => s + maxOf(k), 0)).toBe(V2_COMPLETENESS_MAX);
    // 연락처 축(기자 회신 경로)은 v1 배점 그대로다.
    expect(maxOf("contact")).toBe(5);
    expect(maxOf("contactEmail")).toBe(5);
  });

  it("v1 만점 킷은 신규 섹션이 비어도 기존 항목 상한을 그대로 받는다", () => {
    // 기존 사용자가 겪는 하락폭은 신규 항목 배점(=V2_COMPLETENESS_MAX)으로 한정된다.
    expect(scoreMediaKit(LEGACY_FULL).score).toBe(LEGACY_COMPLETENESS_MAX);
    expect(earnedOf(LEGACY_FULL, "balance")).toBe(scoreMediaKit(EMPTY).items.find((i) => i.key === "balance")!.max);
  });

  it("균형 보정은 기존 7축만 본다 — 신규 섹션이 비어도 보정을 잃지 않는다", () => {
    const reasons = unmetItems(scoreMediaKit(LEGACY_FULL)).map((i) => i.key);
    expect(reasons).toEqual(expect.arrayContaining([...V2_KEYS]));
    expect(reasons).not.toContain("balance");
  });

  it("신규 항목은 하나만 채워도 점수가 오른다(전부-아니면-0이 아니다)", () => {
    const stepped: MediaKitScorable = {
      ...LEGACY_FULL,
      oneLiner: FULL.oneLiner,
      assetPolicy: { usageScope: "보도 목적에 한해 사용할 수 있습니다." },
    };
    expect(scoreMediaKit(stepped).score).toBeGreaterThan(scoreMediaKit(LEGACY_FULL).score);
    expect(earnedOf(stepped, "assetPolicy")).toBe(1);
  });

  /* ── v2 신규 항목 ─────────────────────────────────────────── */

  it("한 문장 정의는 팩 목차 ① 문구를 사유에 인용한다", () => {
    expect(earnedOf(LEGACY_FULL, "oneLiner")).toBe(0);
    expect(reasonOf(LEGACY_FULL, "oneLiner")).toContain(PRESS_KIT_SECTIONS[0]);
    expect(earnedOf({ ...LEGACY_FULL, oneLiner: FULL.oneLiner }, "oneLiner")).toBe(5);
    expect(earnedOf({ ...LEGACY_FULL, oneLiner: WRITING_RULES.unverifiablePlaceholder }, "oneLiner")).toBe(0);
  });

  it("비주얼은 GEO 3규칙 충족률로 채점한다", () => {
    const noRules: MediaKitScorable = { ...FULL, visuals: [{ label: "로고", url: "스크린샷.png" }] };
    // 3검사 중 0개 통과.
    expect(earnedOf(noRules, "visuals")).toBe(0);
    expect(reasonOf(noRules, "visuals")).toContain("파일명 규칙");

    const partial: MediaKitScorable = {
      ...FULL,
      visuals: [{ label: "로고", url: "크랩로지스-크랩WMS-창고자동화.png", alt: "크랩로지스 로고" }],
    };
    // 3검사 중 2개 통과 → 6점 중 4점.
    expect(earnedOf(partial, "visuals")).toBe(4);
    expect(reasonOf(partial, "visuals")).toContain("캡션");

    // 1건만 규칙대로 올려도 만점이다 — 건수 규범을 새로 만들지 않았다.
    expect(earnedOf(FULL, "visuals")).toBe(6);
  });

  it("파일명 규칙은 GEO 패턴에서 토큰 수·확장자만 끌어내 판정한다", () => {
    for (const bad of GEO_ASSET_RULES.filenameBadExamples) {
      expect(followsAssetFilenameRule(bad)).toBe(false);
    }
    expect(followsAssetFilenameRule(undefined)).toBe(false);
    expect(followsAssetFilenameRule(GEO_ASSET_RULES.filenamePattern)).toBe(false); // 대괄호 잔존
    expect(followsAssetFilenameRule("https://cdn.example.com/a/크랩로지스-크랩WMS-대시보드.png?v=2")).toBe(true);
    expect(followsAssetFilenameRule("크랩로지스-크랩WMS-대시보드")).toBe(false); // 확장자 없음
  });

  it("자산 사용 규정은 팩 4항을 개수 비례로 채점하고 빠진 항목을 이름으로 알려 준다", () => {
    const half: MediaKitScorable = {
      ...FULL,
      assetPolicy: { usageScope: "보도 목적 한정", modificationLimits: "로고 변형 금지" },
    };
    expect(ASSET_POLICY_ITEMS).toHaveLength(4);
    expect(earnedOf(half, "assetPolicy")).toBe(2);
    expect(reasonOf(half, "assetPolicy")).toContain(ASSET_POLICY_ITEMS[2]);
    expect(reasonOf(half, "assetPolicy")).not.toContain(ASSET_POLICY_ITEMS[0]);
  });

  it("최근 보도는 매체명·제목이 모두 있는 항목만 센다", () => {
    const titleOnly: MediaKitScorable = { ...FULL, coverage: [{ outlet: "", title: "제목만 있는 보도" }] };
    expect(earnedOf(titleOnly, "coverage")).toBe(0);
    expect(reasonOf(titleOnly, "coverage")).toContain(pressKitSection("⑦"));
    expect(earnedOf(FULL, "coverage")).toBe(3);
  });

  it("신규 필드가 아예 없는 기존 레코드도 예외 없이 채점된다", () => {
    const legacyRecord: MediaKitScorable = { keyMessages: [], factSheet: [], quotes: [] };
    expect(() => scoreMediaKit(legacyRecord)).not.toThrow();
    expect(computeCompleteness(legacyRecord)).toBe(0);
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
    // 유효 1/3 → 13점 중 4점.
    expect(earnedOf(kit, "keyMessages")).toBe(4);
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
    // 수치 항목 2개 중 1개만 출처 → 8점 중 4점. 팩트시트 개수 점수는 그대로.
    expect(earnedOf(half, "factSource")).toBe(4);
    expect(earnedOf(half, "factSheet")).toBe(8);
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
    expect(earnedOf(kit, "factSheet")).toBe(8);
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
    expect(earnedOf(short, "boilerplate")).toBe(8);
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
    expect(earnedOf(minimal, "balance")).toBe(7);

    const oneAxisMissing: MediaKitScorable = { ...minimal, quotes: [] };
    expect(earnedOf(oneAxisMissing, "balance")).toBe(0);
    expect(reasonOf(oneAxisMissing, "balance")).toContain("인용문");
  });

  it("미충족 항목은 점수 손실이 큰 순으로 사유를 준다", () => {
    const unmet = unmetItems(scoreMediaKit(EMPTY));
    expect(unmet[0].key).toBe("keyMessages"); // 13점으로 손실이 가장 크다
    expect(unmet.every((i) => (i.reason ?? "").length > 0)).toBe(true);
  });
});

describe("파일명 규칙 — 의미 기반 판정", () => {
  it("생성 도구 기본 파일명은 토큰 수를 채워도 통과하지 못한다", () => {
    // 이전 구현은 하이픈 3토큰만 세어 이런 이름을 만점 처리했다.
    expect(followsAssetFilenameRule("out/C3-EVENT-001.webp")).toBe(false);
    expect(followsAssetFilenameRule("IMG-2026-0713.png")).toBe(false);
    expect(followsAssetFilenameRule("screenshot-01-final.png")).toBe(false);
  });

  it("의미를 담은 파일명은 통과한다", () => {
    expect(followsAssetFilenameRule("크랩피치-메일게이트-차단율.png")).toBe(true);
    expect(followsAssetFilenameRule("dalpha-ai-agent-benchmark.png")).toBe(true);
  });

  it("토큰이 모자라거나 규칙 문자열이 남으면 여전히 탈락한다", () => {
    expect(followsAssetFilenameRule("card-02.png")).toBe(false);
    expect(followsAssetFilenameRule("[기업명]-[제품명]-[핵심키워드].png")).toBe(false);
    expect(followsAssetFilenameRule("확장자없는-파일-이름")).toBe(false);
  });

  it("회사명을 알면 파일명에 실제로 들어갔는지까지 본다", () => {
    const opts = { companyName: "크랩피치" };
    expect(followsAssetFilenameRule("크랩피치-메일게이트-차단율.png", opts)).toBe(true);
    expect(followsAssetFilenameRule("경쟁사-제품컷-정면.png", opts)).toBe(false);
  });

  it("회사명을 모르면 그 검사는 건너뛴다(기존 데이터 보호)", () => {
    expect(followsAssetFilenameRule("경쟁사-제품컷-정면.png")).toBe(true);
  });
});
