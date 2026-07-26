import { describe, expect, it } from "vitest";
import { blocksSend, checkEmailCompliance } from "./emailCompliance";
import {
  buildEmailDraftWithPreset,
  EMAIL_TEMPLATE_PRESETS,
  type EmailTemplatePresetId,
} from "./emailTemplate";

const OPT_OUT =
  "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.";

function body(inner: string): string {
  return `기자님, 안녕하세요.\n\n${inner}\n\n대표 인터뷰를 원하시면 회신 주세요.\n\n──\n${OPT_OUT}`;
}

describe("emailCompliance 게이트", () => {
  it("정상 초안은 통과한다", () => {
    const r = checkEmailCompliance("[회사] 시드 투자 유치", body("시드 5억 원을 유치했습니다. (출처: 투자사 발표자료)"));
    expect(r.status).toBe("pass");
    expect(blocksSend(r)).toBe(false);
  });

  it("근거 없는 '업계 최초'는 critical — 발송을 차단한다", () => {
    const r = checkEmailCompliance("[회사] 소식", body("업계 최초로 도입했습니다."));
    expect(r.summary.critical).toBeGreaterThanOrEqual(1);
    expect(r.status).toBe("fail");
    expect(blocksSend(r)).toBe(true);
  });

  it("'100%' 단정 표현도 critical", () => {
    const r = checkEmailCompliance("제목", body("100% 안전합니다."));
    expect(r.status).toBe("fail");
  });

  it("수신거부 안내가 없으면 critical — 법적 필수 항목이다", () => {
    const r = checkEmailCompliance("제목", "기자님, 안녕하세요.\n\n소식을 전합니다.\n\n회신 부탁드립니다.");
    expect(r.violations.some((v) => v.label === "수신거부 안내 없음")).toBe(true);
    expect(r.status).toBe("fail");
  });

  it("수치에 출처가 없으면 지적하되 차단하지는 않는다", () => {
    const r = checkEmailCompliance("제목", body("전년 대비 42% 성장했습니다."));
    expect(r.violations.some((v) => v.level === "L4")).toBe(true);
    expect(blocksSend(r)).toBe(false);
  });

  it("인접 문장에 출처가 있으면 L4를 통과시킨다(오탐 완화)", () => {
    const r = checkEmailCompliance(
      "제목",
      body("한국갤럽 2026년 조사 결과입니다. 전년 대비 42% 성장했습니다."),
    );
    expect(r.violations.some((v) => v.level === "L4")).toBe(false);
  });

  it("일상 문맥의 '모두·반드시'는 잡지 않는다(오탐 방지)", () => {
    const r = checkEmailCompliance("제목", body("자료는 모두 첨부했고 문의는 반드시 회신으로 부탁드립니다. (출처: 사내 집계)"));
    expect(r.summary.critical).toBe(0);
  });

  it("CTA가 2개면 중복으로 지적한다", () => {
    const inner = "소식입니다. (출처: 사내 자료)\n\n인터뷰를 원하시면 알려주세요.\n자료를 바로 보내드리겠습니다.";
    const r = checkEmailCompliance("제목", `기자님,\n${inner}\n\n──\n${OPT_OUT}`);
    expect(r.violations.some((v) => v.label === "행동 요청(CTA) 중복")).toBe(true);
  });

  it("본문이 너무 길면 경고하되 차단하지 않는다(근사 환산이라 하드블록 금지)", () => {
    const long = "가".repeat(900);
    const r = checkEmailCompliance("제목", body(long));
    expect(r.violations.some((v) => v.label === "본문이 깁니다")).toBe(true);
    expect(blocksSend(r)).toBe(false);
  });

  it("high 3건 이상이면 warn", () => {
    const r = checkEmailCompliance(
      "제목",
      body("완벽한 제품이며 단연 국내 최고 수준입니다. 유일한 해법이며 완전 무료입니다."),
    );
    expect(["warn", "fail"]).toContain(r.status);
  });
});

/**
 * 자기검사 — 크랩피치가 만든 초안이 크랩피치 자신의 발송 게이트를 통과해야 한다.
 * (실제로 기본 매체 CTA가 "CTA 중복"으로 걸리는 오탐이 이 검사로 잡혔다.)
 */
describe("자체 템플릿이 자기 게이트를 통과한다", () => {
  const EMAIL = {
    companyName: "크랩피치",
    senderName: "홍길동",
    headline: "시드 투자 유치",
    bodyFact: "시드 5억 원 유치 (출처: 투자사 발표자료)",
    contact: "pr@example.com",
  };

  for (const category of ["newswire", "it", "economy", undefined] as const) {
    for (const preset of EMAIL_TEMPLATE_PRESETS) {
      it(`${preset.id} / ${category ?? "general"}`, () => {
        const { subject, body } = buildEmailDraftWithPreset(
          preset.id as EmailTemplatePresetId,
          EMAIL,
          { beatPrimary: "벤처투자", outletCategory: category },
        );
        const r = checkEmailCompliance(subject, body);
        expect(r.violations.map((v) => v.label)).toEqual([]);
        expect(r.status).toBe("pass");
      });
    }
  }
});
