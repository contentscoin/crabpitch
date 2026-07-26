import { describe, expect, it } from "vitest";
import { applyMatchReveal } from "./matchGate";
import { PLAN_LIMITS } from "./plans";

const hi = (score: number) => ({ score, lowConfidence: false });
const low = (score: number) => ({ score, lowConfidence: true });

describe("플랜 발송 후보 한도(matchReveal)", () => {
  it("Free는 상위 3명만 포함하고 나머지는 잠근다", () => {
    const { flags, result } = applyMatchReveal(
      [hi(90), hi(85), hi(80), hi(75), hi(70)],
      PLAN_LIMITS.free.matchReveal,
    );
    expect(flags).toEqual([true, true, true, false, false]);
    expect(result).toEqual({ includedCount: 3, lockedCount: 2 });
  });

  it("신뢰도 low는 한도를 소모하지 않고 항상 제외된다", () => {
    const { flags, result } = applyMatchReveal(
      [low(95), hi(90), hi(85), hi(80), hi(70)],
      3,
    );
    expect(flags).toEqual([false, true, true, true, false]);
    expect(result.includedCount).toBe(3);
    expect(result.lockedCount).toBe(1);
  });

  it("유료 플랜은 사실상 잠금이 없다", () => {
    const many = Array.from({ length: 15 }, (_, i) => hi(90 - i));
    const { result } = applyMatchReveal(many, PLAN_LIMITS.solo.matchReveal);
    expect(result.includedCount).toBe(15);
    expect(result.lockedCount).toBe(0);
  });

  it("후보가 한도보다 적으면 잠금이 없다", () => {
    const { flags, result } = applyMatchReveal([hi(90), hi(80)], 3);
    expect(flags).toEqual([true, true]);
    expect(result.lockedCount).toBe(0);
  });

  it("빈 목록도 안전하다", () => {
    const { flags, result } = applyMatchReveal([], 3);
    expect(flags).toEqual([]);
    expect(result).toEqual({ includedCount: 0, lockedCount: 0 });
  });
});
