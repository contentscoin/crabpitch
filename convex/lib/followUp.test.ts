import { describe, expect, it } from "vitest";
import {
  bodySimilarity,
  buildFollowUpDraft,
  checkFollowUpEligibility,
  COPY_PASTE_THRESHOLD,
  FOLLOW_UP_MIN_DAYS,
  isCopyPaste,
} from "./followUp";
import { hasOptOut } from "./emailTemplate";
import { checkEmailCompliance } from "./emailCompliance";

const NOW = Date.UTC(2026, 6, 26, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("팔로업 가능 여부", () => {
  it("발송되지 않았으면 불가", () => {
    expect(checkFollowUpEligibility(undefined, false, NOW).eligible).toBe(false);
  });

  it("회신을 받았으면 불가 — 회신 스레드에서 이어간다", () => {
    const r = checkFollowUpEligibility(NOW - 30 * DAY, true, NOW);
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("회신");
  });

  it("최소 간격 전에는 불가", () => {
    const r = checkFollowUpEligibility(NOW - 2 * DAY, false, NOW);
    expect(r.eligible).toBe(false);
    expect(r.daysSinceSent).toBe(2);
  });

  it("최소 간격이 지나고 무회신이면 가능", () => {
    const r = checkFollowUpEligibility(NOW - FOLLOW_UP_MIN_DAYS * DAY, false, NOW);
    expect(r.eligible).toBe(true);
  });
});

describe("복붙 검증", () => {
  const original =
    "기자님, 안녕하세요. 크랩피치 홍길동입니다. 시드 5억 원을 유치했습니다. 자료가 필요하시면 회신 주세요.";

  it("같은 글을 다시 보내면 재탕으로 잡는다", () => {
    expect(isCopyPaste(original, original)).toBe(true);
    expect(bodySimilarity(original, original)).toBe(1);
  });

  it("어순만 바꾼 재탕도 잡는다", () => {
    const shuffled =
      "기자님, 안녕하세요. 자료가 필요하시면 회신 주세요. 크랩피치 홍길동입니다. 시드 5억 원을 유치했습니다.";
    expect(bodySimilarity(original, shuffled)).toBeGreaterThan(COPY_PASTE_THRESHOLD);
  });

  it("새 정보를 담은 글은 통과시킨다", () => {
    const followUp =
      "기자님, 안녕하세요. 크랩피치 홍길동입니다. 어제 국내 대형 유통사와 공급 계약을 체결해 내년 상반기부터 전국 매장에 입점합니다. 계약 규모와 일정 자료를 보내드리겠습니다.";
    expect(isCopyPaste(original, followUp)).toBe(false);
  });
});

describe("팔로업 초안", () => {
  const input = {
    senderName: "홍길동",
    companyName: "크랩피치",
    originalSubject: "[크랩피치] 시드 투자 유치",
    newsUpdate:
      "어제 국내 대형 유통사와 공급 계약을 체결했습니다. 계약 규모는 12억 원이며(출처: 계약서 기준) 내년 1월부터 납품합니다.",
    daysSinceSent: 9,
    cta: "대표 인터뷰를 원하시면 회신 주세요. 일정에 맞춰 준비하겠습니다.",
  };

  it("수신거부 문구를 마지막 블록에 유지한다", () => {
    const { body } = buildFollowUpDraft(input);
    expect(hasOptOut(body)).toBe(true);
    expect(body.trimEnd().endsWith("즉시 명단에서 제외하겠습니다.")).toBe(true);
  });

  it("실명 주입 앵커를 유지한다", () => {
    const { body } = buildFollowUpDraft(input);
    expect(/(^|\n)기자님,/.test(body)).toBe(true);
  });

  it("새 정보를 본문에 담는다", () => {
    const { body } = buildFollowUpDraft(input);
    expect(body).toContain("공급 계약을 체결");
  });

  it("발송 게이트를 통과한다", () => {
    const { subject, body } = buildFollowUpDraft(input);
    const r = checkEmailCompliance(subject, body);
    expect(r.status).toBe("pass");
  });

  it("재촉하는 표현을 쓰지 않는다", () => {
    const { body } = buildFollowUpDraft(input);
    expect(body).not.toContain("못 보셨");
    expect(body).not.toContain("확인 부탁드립니다만");
  });
});
