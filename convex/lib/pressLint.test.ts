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
