import { describe, expect, it } from "vitest";
import { excludedSummary, fromHeader } from "./sendOutcome";

const NONE = {
  blockedSuppressed: 0,
  blockedCooldown: 0,
  blockedCompliance: 0,
  overCap: 0,
  overMonthly: 0,
};

describe("excludedSummary", () => {
  it("제외가 없으면 빈 문자열 — 붙일 말이 없으면 붙이지 않는다", () => {
    expect(excludedSummary(NONE)).toBe("");
  });

  it("사유별 건수를 모두 적는다", () => {
    const s = excludedSummary({
      blockedSuppressed: 2,
      blockedCooldown: 1,
      blockedCompliance: 3,
      overCap: 4,
      overMonthly: 5,
    });
    expect(s).toContain("수신거부 2건");
    expect(s).toContain("7일 쿨다운 1건");
    expect(s).toContain("표현 규정 3건");
    expect(s).toContain("캠페인 상한 4건");
    expect(s).toContain("월 한도 5건");
  });

  it("0인 사유는 적지 않는다 — 없는 제외를 있는 것처럼 보이면 안 된다", () => {
    const s = excludedSummary({ ...NONE, blockedCooldown: 1 });
    expect(s).toContain("쿨다운");
    expect(s).not.toContain("수신거부");
    expect(s).not.toContain("월 한도");
  });

  it("어디를 봐야 하는지까지 알려 준다", () => {
    expect(excludedSummary({ ...NONE, overCap: 1 })).toContain("초안 목록");
  });
});

describe("fromHeader", () => {
  it("표시명이 없으면 주소만", () => {
    expect(fromHeader("a@b.com")).toBe("a@b.com");
    expect(fromHeader("a@b.com", "   ")).toBe("a@b.com");
  });

  it("표시명이 있으면 따옴표로 감싼다", () => {
    expect(fromHeader("a@b.com", "홍길동")).toBe('"홍길동" <a@b.com>');
  });

  it("개행을 넣어 헤더를 위조할 수 없다", () => {
    // 표시명은 사용자 입력이다. 개행이 그대로 나가면 Bcc를 임의로 붙일 수 있다.
    const h = fromHeader("a@b.com", "홍길동\r\nBcc: victim@x.com");
    expect(h).not.toContain("\r");
    expect(h).not.toContain("\n");
    expect(h).toBe('"홍길동Bcc: victim@x.com" <a@b.com>');
  });

  it("따옴표·꺾쇠를 넣어 주소를 바꿔치기할 수 없다", () => {
    const h = fromHeader("a@b.com", '" <attacker@x.com> "');
    expect(h).toBe('"attacker@x.com" <a@b.com>');
  });

  it("표시명이 통째로 걸러지면 주소만 남긴다 — 발송을 막지는 않는다", () => {
    expect(fromHeader("a@b.com", '<<>>""')).toBe("a@b.com");
  });
});
