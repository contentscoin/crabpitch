import { describe, expect, it } from "vitest";
import { PILOT_GATE_MIN_DRAFTS, needsPilotApproval, pilotGateMessage } from "./pilotGate";

describe("파일럿 게이트", () => {
  it("초안이 없으면 요구하지 않는다", () => {
    expect(needsPilotApproval([])).toBe(false);
  });

  it("1건짜리 캠페인은 면제한다 — 발송 버튼 자체가 그 초안을 본 행위다", () => {
    expect(needsPilotApproval([{}])).toBe(false);
  });

  it("2건 이상인데 아무도 확인하지 않았으면 보류한다", () => {
    expect(needsPilotApproval([{}, {}])).toBe(true);
    expect(needsPilotApproval(Array.from({ length: 40 }, () => ({})))).toBe(true);
  });

  it("1건만 확인해도 전체가 열린다 — 전량 검토를 요구하지 않는다", () => {
    const drafts = [{}, {}, { approvedAt: 1_700_000_000_000 }, {}];
    expect(needsPilotApproval(drafts)).toBe(false);
  });

  it("면제 경계는 상수와 일치한다", () => {
    const under = Array.from({ length: PILOT_GATE_MIN_DRAFTS - 1 }, () => ({}));
    const at = Array.from({ length: PILOT_GATE_MIN_DRAFTS }, () => ({}));
    expect(needsPilotApproval(under)).toBe(false);
    expect(needsPilotApproval(at)).toBe(true);
  });

  it("안내 문구는 건수와 해제 방법을 모두 담는다", () => {
    const msg = pilotGateMessage(12);
    expect(msg).toContain("12");
    expect(msg).toContain("확인함");
  });
});
