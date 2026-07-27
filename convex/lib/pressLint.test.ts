import { describe, expect, it } from "vitest";
import { lintPressRelease } from "./pressLint";

const CLEAN_BODY =
  "회사가 시드 투자를 유치했다. 한국벤처투자 2026년 집계 기준 5억 원 규모다. 자금은 제품 개발에 쓴다.";

describe("pressLint", () => {
  it("깨끗한 본문은 위반이 없다", () => {
    const r = lintPressRelease("회사, 시드 투자 유치", CLEAN_BODY);
    expect(r.violations).toHaveLength(0);
    expect(r.status).toBe("pass");
  });

  it("근거 없는 '업계 최초'를 critical로 잡는다", () => {
    const r = lintPressRelease("업계 최초 도입", CLEAN_BODY);
    expect(r.summary.critical).toBeGreaterThanOrEqual(1);
    expect(r.violations[0]!.ruleId).toBe("ADV-001");
  });

  it("출처가 붙은 최상급은 통과시킨다(팩 L2 조건)", () => {
    const withSource =
      "한국갤럽 2026년 조사 기준 업계 1위를 기록했다. 조사 모수는 1,000명이다.";
    const r = lintPressRelease("제목", withSource);
    expect(r.violations.some((v) => v.level === "L2")).toBe(false);
  });

  it("출처 없는 최상급은 지적한다", () => {
    const r = lintPressRelease("제목", "국내 최대 규모를 달성했다.");
    expect(r.violations.some((v) => v.level === "L2")).toBe(true);
  });

  it("80자를 넘는 문장을 STYLE-LEN-001로 잡는다", () => {
    const long = `${"가".repeat(90)}.`;
    const r = lintPressRelease("제목", long);
    expect(r.violations.some((v) => v.ruleId === "STYLE-LEN-001")).toBe(true);
  });

  it("확인이 끝나지 않은 placeholder 잔존을 지적한다", () => {
    const r = lintPressRelease("제목", `매출은 [확인 필요]다. ${CLEAN_BODY}`);
    expect(r.violations.some((v) => v.ruleId === "STYLE-TBD-001")).toBe(true);
  });

  it("수치 인근에 출처가 없으면 L4로 지적한다", () => {
    const r = lintPressRelease("제목", "이용자가 전년 대비 42% 늘었다.");
    expect(r.violations.some((v) => v.level === "L4")).toBe(true);
  });
});

/**
 * 미디어킷 대조 규칙은 **원본이 넘어올 때만** 돈다.
 * 기존 호출부(2인자)는 동작이 바뀌지 않아야 한다 — 위 테스트 전체가 그 회귀 가드다.
 */
describe("pressLint — 미디어킷 대조", () => {
  const BOILER =
    "크랩피치는 2023년 설립된 언론 홍보 자동화 기업입니다. 스타트업이 직접 기자에게 소식을 전할 수 있도록 매칭·초안·발송 기록을 한 흐름으로 제공합니다.";
  const FACTS = [
    { label: "누적 이용자", value: "30만 명" },
    { label: "시리즈A", value: "100억원" },
  ];

  it("원본을 안 주면 대조 규칙이 아예 붙지 않는다", () => {
    const r = lintPressRelease("제목", CLEAN_BODY);
    expect(r.violations.some((v) => v.level === "fact")).toBe(false);
  });

  it("회사 소개가 원본과 다르면 FACT-BOILER-001", () => {
    const body = `${CLEAN_BODY}\n\n${BOILER.replace("2023년", "2021년")}`;
    const r = lintPressRelease("제목", body, { boilerplate: BOILER });
    const hit = r.violations.find((v) => v.ruleId === "FACT-BOILER-001");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("high");
  });

  it("회사 소개가 아예 없으면 FACT-BOILER-002", () => {
    const r = lintPressRelease("제목", CLEAN_BODY, { boilerplate: BOILER });
    expect(r.violations.some((v) => v.ruleId === "FACT-BOILER-002")).toBe(true);
  });

  it("원본을 그대로 실으면 대조 위반이 없다", () => {
    const body = `${CLEAN_BODY}\n\n${BOILER}`;
    const r = lintPressRelease("제목", body, { boilerplate: BOILER });
    expect(r.violations.some((v) => v.ruleId.startsWith("FACT-BOILER"))).toBe(false);
  });

  it("팩트시트에 없는 수치를 FACT-NUM-001로 잡는다", () => {
    const body = "한국벤처투자 2026년 집계 기준 이용자 50만 명을 확보했다.";
    const r = lintPressRelease("제목", body, { factSheet: FACTS });
    const hit = r.violations.find((v) => v.ruleId === "FACT-NUM-001");
    expect(hit).toBeDefined();
    expect(hit!.span).toContain("50만");
  });

  it("팩트시트에 있는 수치만 쓰면 통과한다", () => {
    const body = "한국벤처투자 2026년 집계 기준 이용자 30만 명, 시리즈A 100억원 규모다.";
    const r = lintPressRelease("제목", body, { factSheet: FACTS });
    expect(r.violations.some((v) => v.ruleId === "FACT-NUM-001")).toBe(false);
  });

  it("수치 위반이 쏟아져도 다섯 건까지만 보여 준다", () => {
    const body = Array.from({ length: 12 }, (_, i) => `한국은행 집계 ${i + 1}만 명이다.`).join(" ");
    const r = lintPressRelease("제목", body, { factSheet: FACTS });
    expect(r.violations.filter((v) => v.ruleId === "FACT-NUM-001")).toHaveLength(5);
  });
});
