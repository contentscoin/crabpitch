import { describe, expect, it } from "vitest";
import {
  COOLDOWN_MS,
  daysUntilSendable,
  isInCooldown,
  partitionByCooldown,
} from "./cooldown";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("7일 재발송 쿨다운", () => {
  it("발송 이력이 없으면 쿨다운이 아니다", () => {
    expect(isInCooldown(null, NOW)).toBe(false);
    expect(isInCooldown(undefined, NOW)).toBe(false);
  });

  it("6일 전 발송은 아직 쿨다운", () => {
    expect(isInCooldown(NOW - 6 * DAY, NOW)).toBe(true);
  });

  it("정확히 7일이 지나면 발송 가능 (경계)", () => {
    expect(isInCooldown(NOW - COOLDOWN_MS, NOW)).toBe(false);
    expect(isInCooldown(NOW - COOLDOWN_MS + 1, NOW)).toBe(true);
  });

  it("남은 일수를 올림으로 알려준다", () => {
    expect(daysUntilSendable(NOW - 6 * DAY, NOW)).toBe(1);
    expect(daysUntilSendable(NOW - 1 * DAY, NOW)).toBe(6);
    expect(daysUntilSendable(NOW - 8 * DAY, NOW)).toBe(0);
  });

  it("후보를 쿨다운 여부로 가른다", () => {
    const items = [
      { id: "a", last: NOW - 2 * DAY }, // 차단
      { id: "b", last: null }, // 최초 접촉
      { id: "c", last: NOW - 30 * DAY }, // 오래됨
    ];
    const { sendable, blocked } = partitionByCooldown(items, (x) => x.last, NOW);
    expect(sendable.map((x) => x.id)).toEqual(["b", "c"]);
    expect(blocked.map((x) => x.id)).toEqual(["a"]);
  });
});
