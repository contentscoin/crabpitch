import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  partitionBySuppression,
  suppressedEmailSet,
  partitionByCooldown,
  cooldownReason,
  isTestRecipient,
  TEST_OUTLET,
} from "./sendGuard";

describe("발송 직전 수신거부 가드", () => {
  it("억제된 기자를 발송 대상에서 제외한다", () => {
    const suppressed = suppressedEmailSet(["out@zdnet.co.kr"]);
    const { sendable, blocked } = partitionBySuppression(
      [{ email: "keep@zdnet.co.kr" }, { email: "out@zdnet.co.kr" }],
      suppressed,
    );
    expect(sendable).toEqual([{ email: "keep@zdnet.co.kr" }]);
    expect(blocked).toEqual([{ email: "out@zdnet.co.kr" }]);
  });

  it("대소문자·공백 차이로 새지 않는다", () => {
    const suppressed = suppressedEmailSet(["  OUT@ZDNet.co.kr "]);
    const { sendable, blocked } = partitionBySuppression(
      [{ email: "out@zdnet.co.kr" }],
      suppressed,
    );
    expect(sendable).toHaveLength(0);
    expect(blocked).toHaveLength(1);
  });

  it("억제 리스트가 비면 전부 발송 가능", () => {
    const { sendable, blocked } = partitionBySuppression(
      [{ email: "a@x.com" }, { email: "b@x.com" }],
      suppressedEmailSet([]),
    );
    expect(sendable).toHaveLength(2);
    expect(blocked).toHaveLength(0);
  });

  it("이메일을 찾지 못한 초안(빈 문자열)은 억제로 오판하지 않는다", () => {
    const { sendable } = partitionBySuppression(
      [{ email: "" }],
      suppressedEmailSet(["out@zdnet.co.kr"]),
    );
    expect(sendable).toHaveLength(1);
  });

  it("normalizeEmail은 트림·소문자화만 한다", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
  });
});

describe("7일 쿨다운", () => {
  const now = Date.UTC(2026, 6, 26, 12, 0, 0);
  const day = 24 * 60 * 60 * 1000;

  it("발송 이력이 없으면 통과한다", () => {
    const { sendable, blocked } = partitionByCooldown<{ id: string; lastSentAt?: number }>([{ id: "a" }], now);
    expect(sendable).toHaveLength(1);
    expect(blocked).toHaveLength(0);
  });

  it("7일 이내 발송 이력은 제외하고 남은 일수를 알려준다", () => {
    const { sendable, blocked } = partitionByCooldown(
      [{ id: "a", lastSentAt: now - 2 * day }],
      now,
    );
    expect(sendable).toHaveLength(0);
    expect(blocked[0]!.daysRemaining).toBe(5);
  });

  it("정확히 7일이 지나면 다시 보낼 수 있다", () => {
    const { sendable } = partitionByCooldown([{ id: "a", lastSentAt: now - 7 * day }], now);
    expect(sendable).toHaveLength(1);
  });

  it("제외 사유 문구에 기자 식별 정보가 들어가지 않는다", () => {
    const reason = cooldownReason(3);
    expect(reason).toContain("3일 후");
    expect(reason).not.toMatch(/@/);
  });

  it("면제 대상은 이력이 있어도 통과한다", () => {
    const { sendable, blocked } = partitionByCooldown(
      [{ id: "test", lastSentAt: now - 1 * day, cooldownExempt: true }],
      now,
    );
    expect(sendable).toHaveLength(1);
    expect(blocked).toHaveLength(0);
  });

  it("면제는 해당 항목에만 적용되고 나머지는 그대로 막힌다", () => {
    const { sendable, blocked } = partitionByCooldown(
      [
        { id: "test", lastSentAt: now - 1 * day, cooldownExempt: true },
        { id: "real", lastSentAt: now - 1 * day },
      ],
      now,
    );
    expect(sendable.map((d) => d.id)).toEqual(["test"]);
    expect(blocked.map((d) => d.id)).toEqual(["real"]);
  });
});

describe("테스트 수신처 판정", () => {
  it("관리자 시드로 만든 레코드만 면제 대상이다", () => {
    expect(isTestRecipient({ outlet: TEST_OUTLET, source: "manual" })).toBe(true);
  });

  it("매체명만 같고 팩에서 온 레코드는 면제하지 않는다", () => {
    expect(isTestRecipient({ outlet: TEST_OUTLET, source: "opencrab" })).toBe(false);
    expect(isTestRecipient({ outlet: TEST_OUTLET, source: "seed" })).toBe(false);
    expect(isTestRecipient({ outlet: TEST_OUTLET })).toBe(false);
  });

  it("실제 매체는 source가 manual이어도 면제하지 않는다", () => {
    expect(isTestRecipient({ outlet: "전자신문", source: "manual" })).toBe(false);
  });

  it("기자를 찾지 못한 경우(null·undefined)를 면제로 오판하지 않는다", () => {
    expect(isTestRecipient(null)).toBe(false);
    expect(isTestRecipient(undefined)).toBe(false);
    expect(isTestRecipient({})).toBe(false);
  });
});
