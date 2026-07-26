import { describe, expect, it } from "vitest";
import {
  buildEmailDraft,
  buildEmailDraftWithPreset,
  EMAIL_TEMPLATE_PRESETS,
  hasOptOut,
  isEmailTemplatePresetId,
  personalizeForSend,
  renderCustomTemplate,
  type EmailTemplatePresetId,
} from "./emailTemplate";

const EMAIL = {
  companyName: "크랩피치",
  senderName: "홍길동",
  headline: "시드 투자 유치",
  bodyFact: "시드 5억 유치",
  quote: "다음 분기 흑자 전환이 목표다",
  links: ["https://example.com/kit"],
  contact: "pr@example.com",
};
const JOURNALIST = { beatPrimary: "벤처투자", topReferenceTitle: "시드 투자 동향" };

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

describe("emailTemplate 프리셋", () => {
  it("4개 프리셋을 정의하고 id 가드가 동작한다", () => {
    expect(EMAIL_TEMPLATE_PRESETS.map((p) => p.id)).toEqual([
      "standard",
      "data",
      "story",
      "brief",
    ]);
    expect(isEmailTemplatePresetId("data")).toBe(true);
    expect(isEmailTemplatePresetId("nope")).toBe(false);
  });

  it("모든 프리셋이 기자님 호칭·수신거부·개인화 후킹을 포함한다", () => {
    for (const p of EMAIL_TEMPLATE_PRESETS) {
      const { subject, body } = buildEmailDraftWithPreset(
        p.id as EmailTemplatePresetId,
        EMAIL,
        JOURNALIST,
      );
      expect(subject.length, p.id).toBeGreaterThan(0);
      expect(body, p.id).toContain("기자님");
      expect(hasOptOut(body), p.id).toBe(true);
      expect(body, p.id).toContain("시드 투자 동향"); // 최근 기사 후킹
    }
  });

  it("standard 프리셋은 기존 buildEmailDraft와 동일하다", () => {
    expect(buildEmailDraftWithPreset("standard", EMAIL, JOURNALIST)).toEqual(
      buildEmailDraft(EMAIL, JOURNALIST),
    );
  });

  it("data 프리셋은 수치를 제목·팩트 목록으로 앞세운다", () => {
    const { subject, body } = buildEmailDraftWithPreset("data", EMAIL, JOURNALIST);
    expect(subject).toContain("시드 5억");
    expect(body).toContain("· 수치: 시드 5억 유치");
  });
});

describe("renderCustomTemplate", () => {
  it("자리표시자를 치환한다", () => {
    const { subject, body } = renderCustomTemplate(
      "[{{회사명}}] {{헤드라인}}",
      "{{후킹}}\n\n{{핵심수치}} — {{비트}} 담당 기자님께.\n{{발신자}} 드림",
      EMAIL,
      JOURNALIST,
    );
    expect(subject).toBe("[크랩피치] 시드 투자 유치");
    expect(body).toContain("시드 5억 유치 — 벤처투자 담당 기자님께.");
    expect(body).toContain("홍길동 드림");
  });

  it("수신거부·기자님 호칭이 없으면 강제로 보정한다", () => {
    const { body } = renderCustomTemplate("제목", "인사말 없이 본문만.", EMAIL, JOURNALIST);
    expect(body.startsWith("기자님, 안녕하세요.")).toBe(true);
    expect(hasOptOut(body)).toBe(true);
  });

  it("모르는 자리표시자는 그대로 남겨 사용자가 알아채게 한다", () => {
    const { body } = renderCustomTemplate("제목", "기자님, {{없는키}} 수신거부 안내.", EMAIL, JOURNALIST);
    expect(body).toContain("{{없는키}}");
  });

  it("빈 제목 템플릿은 기본 제목으로 폴백한다", () => {
    const { subject } = renderCustomTemplate("", "기자님, 본문. 수신거부 안내.", EMAIL, JOURNALIST);
    expect(subject).toContain("크랩피치");
  });
});
