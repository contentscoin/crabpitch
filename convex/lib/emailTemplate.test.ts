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
  type JournalistContext,
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
const JOURNALIST: JournalistContext = { beatPrimary: "벤처투자", topReferenceTitle: "시드 투자 동향" };

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
    // 개인화 자리표시자가 없는 템플릿에는 후킹이 자동 삽입된다.
    expect(body).toContain("시드 투자 동향");
  });

  it("스캐폴드형({{후킹}} 시작) 템플릿도 실명 주입 앵커를 보장한다", () => {
    // {{후킹}}은 "기자님의 …"로 시작하지만 앵커("기자님,")는 아니므로 인사말이 붙어야 한다.
    const { body } = renderCustomTemplate(
      "[{{회사명}}] {{헤드라인}}",
      "{{후킹}}\n\n{{회사명}}은(는) {{헤드라인}}. {{핵심수치}}\n\n{{발신자}} 드림",
      EMAIL,
      JOURNALIST,
    );
    expect(/(^|\n)기자님,/.test(body)).toBe(true);
    const personalized = personalizeForSend(body, "이도원");
    expect(personalized).toContain("이도원 기자님,");
  });

  it("{{수신거부}} 자리표시자는 표준 문구로 렌더되고 중복 삽입되지 않는다", () => {
    const { body } = renderCustomTemplate(
      "제목",
      "기자님, 소식 전합니다.\n\n{{수신거부}}",
      EMAIL,
      JOURNALIST,
    );
    expect(hasOptOut(body)).toBe(true);
    expect(body.match(/수신거부/g)?.length).toBe(1);
  });

  it("기능하지 않는 수신거부 문장은 통과시키지 않고 표준 문구를 덧붙인다", () => {
    const { body } = renderCustomTemplate(
      "제목",
      "기자님, 수신거부 요청은 받지 않습니다.",
      EMAIL,
      JOURNALIST,
    );
    expect(body).toContain("회신으로 '수신거부'라 남겨주세요");
  });

  it("제목에 개행이 섞이면 한 줄로 정리한다", () => {
    const { subject } = renderCustomTemplate(
      "[{{회사명}}]\n{{헤드라인}}",
      "기자님, 본문.",
      EMAIL,
      JOURNALIST,
    );
    expect(subject).toBe("[크랩피치] 시드 투자 유치");
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

describe("hasOptOut", () => {
  it("표준 문구·실행 가능한 안내만 인정한다", () => {
    expect(hasOptOut("… '수신거부'라고 회신 주시면 제외하겠습니다.")).toBe(true);
    expect(hasOptOut("수신거부라 남겨주세요.")).toBe(true);
    expect(hasOptOut("수신거부 요청은 받지 않습니다.")).toBe(false);
    expect(hasOptOut("{{수신거부}}")).toBe(false);
    expect(hasOptOut("본문에 아무 안내 없음")).toBe(false);
  });
});

describe("7블록 컴플라이언스 승계", () => {
  const NOW = Date.UTC(2026, 6, 26, 12, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;

  const withArticles = {
    ...JOURNALIST,
    outletCategory: "newswire" as const,
    referenceArticles: [
      { title: "최근 투자 동향", url: "https://www.etnews.com/20260715000123", topic: "투자", publishedAt: Date.UTC(2026, 6, 15, 12) },
    ],
  };

  it("엠바고가 있으면 모든 프리셋의 최상단에 표기된다", () => {
    for (const p of EMAIL_TEMPLATE_PRESETS) {
      const { body } = buildEmailDraftWithPreset(
        p.id as EmailTemplatePresetId,
        { ...EMAIL, embargoAt: Date.UTC(2026, 6, 30, 0, 0), now: NOW },
        withArticles,
      );
      expect(body.startsWith("[엠바고]"), p.id).toBe(true);
      expect(body, p.id).toContain("엠바고 해제 시각 이후 사용 가능");
    }
  });

  it("엠바고가 없으면 표기 자체가 없다", () => {
    const { body } = buildEmailDraftWithPreset("standard", { ...EMAIL, now: NOW }, withArticles);
    expect(body).not.toContain("[엠바고]");
  });

  it("모든 프리셋이 매체 유형별 CTA를 정확히 1개 포함한다", () => {
    for (const p of EMAIL_TEMPLATE_PRESETS) {
      const { body } = buildEmailDraftWithPreset(
        p.id as EmailTemplatePresetId,
        { ...EMAIL, now: NOW },
        withArticles,
      );
      // 통신사 CTA(자료 즉시 송부)만 있고 기본 CTA(인터뷰 제안)는 없어야 한다
      expect(body, p.id).toContain("회신 주시면 바로 송부드리겠습니다");
      expect(body, p.id).not.toContain("대표 인터뷰를 원하시면");
    }
  });

  it("미등록 매체는 기본 CTA(인터뷰 제안)로 폴백한다", () => {
    const { body } = buildEmailDraftWithPreset("standard", { ...EMAIL, now: NOW }, JOURNALIST);
    expect(body).toContain("대표 인터뷰를 원하시면");
  });

  it("수신거부 문구는 언제나 마지막 블록이다", () => {
    for (const p of EMAIL_TEMPLATE_PRESETS) {
      const { body } = buildEmailDraftWithPreset(
        p.id as EmailTemplatePresetId,
        { ...EMAIL, embargoAt: Date.UTC(2026, 6, 30), now: NOW },
        withArticles,
      );
      expect(hasOptOut(body), p.id).toBe(true);
      expect(body.trimEnd().endsWith("즉시 명단에서 제외하겠습니다."), p.id).toBe(true);
    }
  });
});

describe("후킹 기사 선택과 신선도 강등", () => {
  const NOW = Date.UTC(2026, 6, 26, 12, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;

  it("발행일을 알면 날짜까지 인용한다", () => {
    const { body } = buildEmailDraft(
      { ...EMAIL, now: NOW },
      { ...JOURNALIST, referenceArticles: [{ title: "AI 투자 확대", publishedAt: Date.UTC(2026, 6, 15, 12) }] },
    );
    expect(body).toContain("지난 7월 15일 'AI 투자 확대' 기사");
  });

  it("발행일을 모르면 날짜를 주장하지 않고 제목만 인용한다", () => {
    const { body } = buildEmailDraft(
      { ...EMAIL, now: NOW },
      { ...JOURNALIST, referenceArticles: [{ title: "AI 투자 확대" }] },
    );
    expect(body).toContain("'AI 투자 확대' 기사");
    expect(body).not.toContain("지난");
  });

  it("신선도 상한을 넘긴 기사는 generic 후킹으로 강등한다", () => {
    const { body } = buildEmailDraft(
      { ...EMAIL, now: NOW },
      { ...JOURNALIST, topReferenceTitle: undefined, referenceArticles: [{ title: "오래된 기사", publishedAt: NOW - 400 * DAY }] },
    );
    expect(body).not.toContain("오래된 기사");
    expect(body).toContain("벤처투자 분야를 취재하시는 기자님께");
  });

  it("캠페인 태그와 겹치는 기사를 우선 고른다", () => {
    const { body } = buildEmailDraft(
      { ...EMAIL, topicTags: ["핀테크"], now: NOW },
      {
        ...JOURNALIST,
        referenceArticles: [
          { title: "일반 산업 동향", publishedAt: NOW - 2 * DAY },
          { title: "핀테크 규제 완화", publishedAt: NOW - 20 * DAY },
        ],
      },
    );
    expect(body).toContain("핀테크 규제 완화");
  });
});

describe("커스텀 템플릿 신규 자리표시자", () => {
  const NOW = Date.UTC(2026, 6, 26, 12, 0, 0);

  it("{{엠바고}}·{{매체CTA}}를 렌더링한다", () => {
    const { body } = renderCustomTemplate(
      "제목",
      "기자님, {{엠바고}}\n\n{{핵심수치}}\n\n{{매체CTA}}\n\n{{수신거부}}",
      { ...EMAIL, embargoAt: Date.UTC(2026, 6, 30, 9, 0), now: NOW },
      { ...JOURNALIST, outletCategory: "it" },
    );
    expect(body).toContain("[엠바고] 2026년 7월 30일");
    expect(body).toContain("기술 구조와 실측 데이터");
    expect(hasOptOut(body)).toBe(true);
  });

  it("엠바고가 없으면 {{엠바고}}는 빈칸으로 사라진다", () => {
    const { body } = renderCustomTemplate(
      "제목",
      "기자님, {{엠바고}}{{핵심수치}} {{수신거부}}",
      { ...EMAIL, now: NOW },
      JOURNALIST,
    );
    expect(body).not.toContain("[엠바고]");
  });

  it("{{최근기사}}는 후킹이 실제로 고른 기사와 일치한다", () => {
    const { body } = renderCustomTemplate(
      "제목",
      "기자님, {{후킹}}\n최근기사={{최근기사}}\n{{수신거부}}",
      { ...EMAIL, now: NOW },
      { ...JOURNALIST, topReferenceTitle: undefined, referenceArticles: [{ title: "선택된 기사", publishedAt: NOW - 3 * 24 * 3600 * 1000 }] },
    );
    expect(body).toContain("최근기사=선택된 기사");
  });
});

/**
 * 실제로 기자에게 나간 메일에서 확인된 결함들.
 *
 * 2026-08-03 hiway@kakao.com 시험 발송 본문:
 *   「(주)더에이치클럽/FMG은(는) 크랩피치, MCP 채팅에서 기자 발송까지 지원.
 *     MCP 도구 16종 기술 차별점과 사용성 관점에서 자료를 준비했습니다.
 *     김대표 대표는 "…"라고 밝혔습니다.」
 */
describe("발송 메일 문안 회귀", () => {
  const FMG = {
    ...EMAIL,
    companyName: "(주)더에이치클럽/FMG",
    headline: "크랩피치, MCP 채팅에서 기자 발송까지 지원",
    bodyFact: "MCP 도구 16종",
    spokesName: "김대표",
    spokesTitle: "대표",
    links: [],
  };
  const AI: JournalistContext = { beatPrimary: "AI/데이터", topReferenceTitle: "MCP 확산" };

  const ALL_PRESETS: EmailTemplatePresetId[] = ["standard", "data", "story", "brief"];

  it("조사 병기가 어느 프리셋에서도 나가지 않는다", () => {
    for (const preset of ALL_PRESETS) {
      const { body } = buildEmailDraftWithPreset(preset, FMG, AI);
      expect(body).not.toContain("은(는)");
      expect(body).not.toContain("이(가)");
      expect(body).not.toContain("을(를)");
    }
  });

  it("로마자로 끝나는 회사명에 맞는 조사를 고른다", () => {
    const { body } = buildEmailDraft(FMG, AI);
    expect(body).toContain("(주)더에이치클럽/FMG는");
  });

  it("명사구 수치가 앵글 문장에 붙어 한 문장이 되지 않는다", () => {
    for (const preset of ALL_PRESETS) {
      const { body } = buildEmailDraftWithPreset(preset, FMG, AI);
      expect(body).not.toContain("MCP 도구 16종 기술 차별점");
      expect(body).toContain("MCP 도구 16종.");
    }
  });

  it("수치가 비어 있으면 앵글만 남고 앞에 공백·빈 문장이 생기지 않는다", () => {
    const { body } = buildEmailDraft({ ...FMG, bodyFact: "" }, AI);
    expect(body).toContain("기술 차별점과 사용성 관점에서 자료를 준비했습니다.");
    expect(body).not.toMatch(/^\s+기술 차별점/m);
    expect(body).not.toMatch(/\.\s*\.\s/);
  });

  it("이름이 직함으로 끝나면 직함을 겹쳐 쓰지 않는다", () => {
    const { body } = buildEmailDraft(FMG, AI);
    expect(body).not.toContain("김대표 대표는");
    expect(body).toContain('김대표는 "');
  });

  it("화자 이름에도 조사를 맞춘다", () => {
    const { body } = buildEmailDraft({ ...FMG, spokesName: "홍길동" }, AI);
    expect(body).toContain('홍길동 대표는 "');
  });

  it("헤드라인이 명사형 제목이어도 서술어 자리에 들어가지 않는다", () => {
    const { body } = buildEmailDraft(FMG, AI);
    // 제목은 따옴표로 감싸고 문장은 따로 끝맺는다.
    expect(body).toContain("'크랩피치, MCP 채팅에서 기자 발송까지 지원' 소식을 전합니다.");
  });

  it("뉴스 가치 한 줄이 본문에 실린다 — 예전에는 어디에도 나가지 않았다", () => {
    const { body } = buildEmailDraft({ ...FMG, meaning: "채팅에서 기자 발송까지 한 번에" }, AI);
    expect(body).toContain("채팅에서 기자 발송까지 한 번에.");
  });

  it("첨부가 있으면 본문이 파일명을 밝힌다", () => {
    const name = "보도자료_크랩피치_2026-08-03.txt";
    for (const preset of ALL_PRESETS) {
      const { body } = buildEmailDraftWithPreset(preset, { ...FMG, attachmentName: name }, AI);
      expect(body).toContain(`· 보도자료 전문을 첨부했습니다: ${name}`);
    }
  });

  it("첨부가 없으면 첨부 안내도 없다 — 오지 않은 파일을 가리키지 않는다", () => {
    const { body } = buildEmailDraft(FMG, AI);
    expect(body).not.toContain("첨부했습니다");
  });

  it("첨부 자체가 자산이므로 CTA가 자료 보유를 단언할 수 있다", () => {
    const withAttachment = buildEmailDraft(
      { ...FMG, attachmentName: "보도자료.txt" },
      { ...AI, outletCategory: "newswire" },
    ).body;
    expect(withAttachment).toContain("원문 자료와 이미지가 준비돼 있습니다");

    // 링크도 첨부도 없으면 예전대로 "준비해 보내드리겠습니다"에 머문다.
    const bare = buildEmailDraft(FMG, { ...AI, outletCategory: "newswire" }).body;
    expect(bare).toContain("준비해 보내드리겠습니다");
  });

  it("수신거부는 여전히 마지막 블록이다", () => {
    for (const preset of ALL_PRESETS) {
      const { body } = buildEmailDraftWithPreset(
        preset,
        { ...FMG, attachmentName: "보도자료.txt", meaning: "왜 지금인가" },
        AI,
      );
      expect(hasOptOut(body)).toBe(true);
      expect(body.trimEnd().endsWith("즉시 명단에서 제외하겠습니다.")).toBe(true);
    }
  });
});
