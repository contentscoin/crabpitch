import { describe, expect, it } from "vitest";
import { defaultInterviewSlots, formatInterviewConfirmDraft } from "./interviewSlots";

describe("interviewSlots", () => {
  it("슬롯 3개를 반환한다", () => {
    const slots = defaultInterviewSlots(Date.UTC(2026, 6, 24, 3, 0, 0)); // 2026-07-24 12:00 KST
    expect(slots).toHaveLength(3);
    expect(slots[0]).toContain("KST");
    expect(slots[1]).toContain("KST");
    expect(slots[2]).toContain("KST");
  });

  it("확정 초안에 일정과 기자님을 포함한다", () => {
    const draft = formatInterviewConfirmDraft("2026-07-25 10:00 KST");
    expect(draft).toContain("기자님");
    expect(draft).toContain("2026-07-25 10:00 KST");
  });
});
