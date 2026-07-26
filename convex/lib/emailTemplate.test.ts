import { describe, expect, it } from "vitest";
import { buildEmailDraft, hasOptOut, personalizeForSend } from "./emailTemplate";

describe("emailTemplate", () => {
  it("수신거부 문구를 본문에 포함한다", () => {
    const { subject, body } = buildEmailDraft(
      {
        companyName: "크랩피치",
        senderName: "홍길동",
        headline: "시드 투자 유치",
        bodyFact: "시드 5억 유치",
      },
      { beatPrimary: "벤처투자", topReferenceTitle: "시드 투자 동향" },
    );
    expect(subject).toContain("크랩피치");
    expect(hasOptOut(body)).toBe(true);
    expect(body).toContain("기자님");
  });

  it("발송 직전 실명만 주입한다", () => {
    const personalized = personalizeForSend("기자님, 안녕하세요.\n본문", "이도원");
    expect(personalized.startsWith("이도원 기자님,")).toBe(true);
  });
});
