/**
 * 골격(preset·custom) 인식 회귀 방지.
 *
 * 이 파일이 잡는 사고: AI 개인화 단계가 골격을 모른 채 모든 초안을 하나의 분량 규칙으로
 * 다듬어, 사용자가 고른 '초간결'·'데이터 중심'이 무의미해지는 것.
 */
import { describe, expect, it } from "vitest";
import {
  buildEmailContext,
  buildEmailDraftWithPreset,
  EMAIL_TEMPLATE_PRESETS,
  findUnknownPlaceholders,
  isEmailTemplateKind,
  leadingSentences,
  renderCustomTemplate,
  TEMPLATE_PLACEHOLDERS,
  type EmailTemplateKind,
  type EmailTemplatePresetId,
} from "./emailTemplate";
import { checkEmailCompliance, EMAIL_BODY_CHAR_MAX } from "./emailCompliance";
import {
  EMAIL_BODY_SCALE,
  emailEnhanceSystemPrompt,
  enhanceLengthBand,
  parseEnhanceEmailResult,
} from "./anthropicEnhance";

const ALL_KINDS: EmailTemplateKind[] = [
  "standard",
  "data",
  "story",
  "brief",
  "custom",
  "followup",
];

const EMAIL = {
  companyName: "크랩피치",
  senderName: "홍길동",
  headline: "시드 투자 유치",
  bodyFact: "시드 5억 원 유치 (출처: 투자사 발표자료)",
  contact: "pr@example.com",
};

const OPT_OUT =
  "본 메일 수신을 원치 않으시면 회신으로 '수신거부'라 남겨주세요. 즉시 명단에서 제외하겠습니다.";

describe("EmailTemplateKind", () => {
  it("프리셋 4종 + custom + followup을 인식하고 그 밖은 거부한다", () => {
    for (const k of ALL_KINDS) expect(isEmailTemplateKind(k)).toBe(true);
    expect(isEmailTemplateKind("standard2")).toBe(false);
    expect(isEmailTemplateKind("")).toBe(false);
  });

  /**
   * 팔로업은 프리셋을 상속하지 않는다 — `buildFollowUpDraft`가 만드는 별도 골격이다.
   * 원본 프리셋을 물려주면 AI가 없는 구조(데이터 불릿 등)를 보존하라는 지시를 받는다.
   */
  it("followup은 별도 골격으로 다뤄진다", () => {
    const p = emailEnhanceSystemPrompt("followup", "가".repeat(300));
    expect(p).toContain("팔로업");
    expect(p).toContain("새 소식");
    // 늘리는 것을 거의 허용하지 않는다 — 늘어나면 재촉하는 메일이 된다.
    expect(EMAIL_BODY_SCALE.followup.max).toBeLessThanOrEqual(
      EMAIL_BODY_SCALE.standard.max,
    );
  });

  it("EMAIL_BODY_SCALE이 모든 골격을 빠짐없이 덮는다", () => {
    // 골격을 새로 추가하고 배수를 잊으면 undefined가 되어 검사가 조용히 꺼진다.
    for (const k of ALL_KINDS) {
      expect(EMAIL_BODY_SCALE[k]).toBeDefined();
      expect(EMAIL_BODY_SCALE[k].min).toBeLessThan(1);
      expect(EMAIL_BODY_SCALE[k].max).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * 갓 생성된 초안은 **자기 자신의 분량 규범을 위반하지 않아야** 한다.
 *
 * 한때 골격별 절대 글자수 표를 뒀다가 이 성질이 깨졌다: 템플릿 출력 길이는 골격이 아니라
 * 입력 길이가 결정하는데(실측 152~708자, 4.6배) 절대값으로 잡으면 긴 입력에서 방금 만든
 * 초안이 상한을 넘고, AI 다듬기 결과가 항상 폐기된다. 그래서 분량은 원본 대비 배수로 본다.
 *
 * 입력 폭을 최소~긴 것까지 넓게 잡는다 — 픽스처가 좁으면 이 검사가 상한을 놓친다.
 */
describe("갓 생성된 초안은 자기 규범을 위반하지 않는다", () => {
  // 수치에는 출처 표지를 붙인다 — 없으면 L4(수치 무출처)가 걸리는 것이 **정상 동작**이고,
  // 이 검사가 보려는 것은 분량 규범이다.
  const MINIMAL = {
    companyName: "A",
    senderName: "B",
    headline: "출시",
    bodyFact: "1건 (자사 집계)",
  };
  const LONG = {
    companyName: "큐레잇",
    senderName: "박서준",
    headline: "소상공인 정산 자동화 서비스가 시드 라운드에서 10억 원을 유치하고 전국으로 확대한다",
    bodyFact:
      "시드 10억 원 유치, 정산 처리 4시간→20분 단축, 누적 도입 매장 1만 곳 (자사 집계, 2026년 6월 30일)",
    quote: "정산 때문에 밤을 새우는 사장님이 없게 만드는 것이 목표이며 올해 2만 곳으로 확대합니다",
    spokesName: "박서준",
    spokesTitle: "대표",
    contact: "pr@qurate.example.com",
    links: ["https://qurate.example.com/press/seed", "https://qurate.example.com/kit"],
    embargoAt: Date.UTC(2026, 7, 5, 1, 0, 0),
  };

  for (const preset of EMAIL_TEMPLATE_PRESETS) {
    for (const [label, email] of [
      ["최소 입력", MINIMAL],
      ["보통 입력", EMAIL],
      ["긴 입력", LONG],
    ] as const) {
      for (const category of ["newswire", "broadcast", "it", "economy", undefined] as const) {
        it(`${preset.id} / ${label} / ${category ?? "general"}`, () => {
          const { subject, body } = buildEmailDraftWithPreset(
            preset.id as EmailTemplatePresetId,
            email,
            { beatPrimary: "벤처투자", outletCategory: category },
          );
          // ① 발송 게이트를 위반 0건으로 통과한다.
          const r = checkEmailCompliance(subject, body);
          expect(r.violations.map((v) => v.label)).toEqual([]);
          expect(r.status).toBe("pass");

          // ② 자기 자신은 언제나 허용 범위 안이다 — 다듬기가 원본을 폐기할 수 없다.
          const band = enhanceLengthBand(preset.id, body);
          const chars = body.replace(/\s/g, "").length;
          expect(chars).toBeGreaterThanOrEqual(band.min);
          expect(chars).toBeLessThanOrEqual(band.max);
        });
      }
    }
  }
});

describe("enhanceLengthBand", () => {
  const base = "가".repeat(300);

  it("원본 길이에 배수를 적용한다", () => {
    const band = enhanceLengthBand("standard", base);
    expect(band.min).toBe(Math.round(300 * EMAIL_BODY_SCALE.standard.min));
    expect(band.max).toBe(Math.round(300 * EMAIL_BODY_SCALE.standard.max));
  });

  it("초간결은 늘릴 여유가 가장 좁다", () => {
    const brief = enhanceLengthBand("brief", base);
    const standard = enhanceLengthBand("standard", base);
    expect(brief.max).toBeLessThan(standard.max);
  });

  it("절대 상한(게이트 안전망)을 넘지 않는다", () => {
    const band = enhanceLengthBand("standard", "가".repeat(2000));
    expect(band.max).toBe(EMAIL_BODY_CHAR_MAX);
  });

  it("원본이 길수록 허용 범위도 함께 커진다(절대값 고정이 아니다)", () => {
    const small = enhanceLengthBand("standard", "가".repeat(150));
    const large = enhanceLengthBand("standard", "가".repeat(600));
    expect(large.max).toBeGreaterThan(small.max);
    expect(large.min).toBeGreaterThan(small.min);
  });
});

describe("checkEmailCompliance 분량 검사", () => {
  function bodyOf(inner: string): string {
    return `기자님, 안녕하세요.\n\n${inner}\n\n대표 인터뷰를 원하시면 회신 주세요.\n\n──\n${OPT_OUT}`;
  }

  it("짧은 본문을 지적하지 않는다 — 원본을 모르는 게이트는 판단 근거가 없다", () => {
    const r = checkEmailCompliance("제목", bodyOf("짧은 소식입니다."));
    expect(r.violations.some((v) => v.label.includes("짧"))).toBe(false);
    expect(r.status).toBe("pass");
  });

  it("절대 상한을 넘으면 경고하되 차단하지 않는다", () => {
    const r = checkEmailCompliance("제목", bodyOf("가".repeat(EMAIL_BODY_CHAR_MAX + 100)));
    expect(r.violations.some((v) => v.label === "본문이 깁니다")).toBe(true);
    expect(r.status).not.toBe("fail");
  });
});

describe("emailEnhanceSystemPrompt(kind, baseBody)", () => {
  it("원본 길이에서 계산한 범위를 프롬프트에 넣는다", () => {
    const base = "가".repeat(400);
    for (const kind of ALL_KINDS) {
      const band = enhanceLengthBand(kind, base);
      const p = emailEnhanceSystemPrompt(kind, base);
      expect(p).toContain(`${band.min}~${band.max}자`);
      // 현재 길이를 알려 주면 모델이 기준선을 안다.
      expect(p).toContain("400자");
    }
  });

  it("원본을 주지 않으면 고정 숫자 범위를 지시하지 않는다", () => {
    // 입력 길이를 모르는데 숫자를 던지면 모델이 그 숫자를 맞추려고 내용을 지어낸다.
    const p = emailEnhanceSystemPrompt("standard");
    expect(p).toContain("원본과 비슷하게");
    expect(p).not.toContain("600~800");
  });

  it("같은 골격이라도 원본이 길면 지시 범위도 커진다", () => {
    const short = emailEnhanceSystemPrompt("standard", "가".repeat(200));
    const long = emailEnhanceSystemPrompt("standard", "가".repeat(600));
    expect(short).not.toBe(long);
  });

  it("골격별 구조 보존 지시가 서로 다르다", () => {
    const prompts = ALL_KINDS.map((k) => emailEnhanceSystemPrompt(k));
    expect(new Set(prompts).size).toBe(ALL_KINDS.length);
    expect(emailEnhanceSystemPrompt("brief")).toContain("늘리지 않는다");
    expect(emailEnhanceSystemPrompt("data")).toContain("불릿");
    expect(emailEnhanceSystemPrompt("custom")).toContain("문단");
  });

  it("지어내기 금지 규칙과 few-shot 대조 예시를 포함한다", () => {
    const p = emailEnhanceSystemPrompt();
    expect(p).toContain("입력에 없는 사실");
    expect(p).toContain("나쁜 결과");
    expect(p).toContain("좋은 결과");
  });
});

describe("parseEnhanceEmailResult 분량 이탈 방어", () => {
  /** 원본 = 결정적 템플릿 출력. 다듬기 결과는 이 길이를 기준으로 판정한다. */
  function makeFallback(innerChars: number) {
    return {
      subject: "[크랩피치] 원본 제목",
      body: `기자님, 안녕하세요.\n\n${"가".repeat(innerChars)}\n\n자료를 보내드리겠습니다.\n\n──\n${OPT_OUT}`,
    };
  }
  function enhanced(innerChars: number) {
    return `기자님, 안녕하세요.\n\n${"나".repeat(innerChars)}\n\n자료를 보내드리겠습니다.\n\n──\n${OPT_OUT}`;
  }

  it("원본 대비 크게 부풀린 본문은 되돌린다", () => {
    const fallback = makeFallback(200);
    const r = parseEnhanceEmailResult(
      JSON.stringify({ subject: "[크랩피치] 부풀린 제목", body: enhanced(1000) }),
      fallback,
      "standard",
    );
    expect(r).toEqual(fallback);
  });

  it("원본 대비 크게 줄인 본문도 되돌린다 — 수치·근거를 잘라낸 결과다", () => {
    const fallback = makeFallback(300);
    const r = parseEnhanceEmailResult(
      JSON.stringify({ subject: "[크랩피치] 줄인 제목", body: enhanced(10) }),
      fallback,
      "standard",
    );
    expect(r).toEqual(fallback);
  });

  it("비슷한 분량의 다듬기는 통과시킨다", () => {
    const fallback = makeFallback(300);
    const r = parseEnhanceEmailResult(
      JSON.stringify({ subject: "[크랩피치] 다듬은 제목", body: enhanced(330) }),
      fallback,
      "standard",
    );
    expect(r.subject).toBe("[크랩피치] 다듬은 제목");
    expect(r.body).toContain("나");
  });

  it("초간결은 표준이 허용하는 증가폭에서도 폐기된다", () => {
    const fallback = makeFallback(300);
    const grown = JSON.stringify({ subject: "[크랩피치] 늘린 제목", body: enhanced(430) });
    expect(parseEnhanceEmailResult(grown, fallback, "brief")).toEqual(fallback);
    expect(parseEnhanceEmailResult(grown, fallback, "standard").body).toContain("나");
  });

  it("규정 위반(수신거부 삭제)은 분량과 무관하게 되돌린다", () => {
    const fallback = makeFallback(300);
    const noOptOut = `기자님, 안녕하세요.\n\n${"나".repeat(300)}\n\n자료를 보내드리겠습니다.`;
    // 파서가 수신거부를 강제 삽입하므로 결과는 원본이 아니지만 규정은 통과해야 한다.
    const r = parseEnhanceEmailResult(
      JSON.stringify({ subject: "제목", body: noOptOut }),
      fallback,
      "standard",
    );
    expect(r.body).toContain("수신거부");
  });
});

describe("findUnknownPlaceholders", () => {
  it("지원하는 키 전체를 통과시킨다", () => {
    const all = TEMPLATE_PLACEHOLDERS.map((p) => `{{${p.key}}}`).join("\n");
    expect(findUnknownPlaceholders(all)).toEqual([]);
  });

  it("오타 키를 잡는다 — 치환되지 않고 그대로 발송되는 경로다", () => {
    expect(findUnknownPlaceholders("{{제목}} {{회사명}}")).toEqual(["제목"]);
  });

  it("공백이 섞인 표기도 같은 키로 본다", () => {
    expect(findUnknownPlaceholders("{{  회사명  }}")).toEqual([]);
    expect(findUnknownPlaceholders("{{  없는키  }}")).toEqual(["없는키"]);
  });

  it("제목·본문을 함께 검사하고 중복은 한 번만 보고한다", () => {
    expect(findUnknownPlaceholders("{{오타}}", "{{오타}} {{다른오타}}")).toEqual([
      "오타",
      "다른오타",
    ]);
  });

  it("자리표시자가 없으면 빈 배열", () => {
    expect(findUnknownPlaceholders("자리표시자 없는 평문")).toEqual([]);
  });
});

describe("leadingSentences", () => {
  it("상한 이내면 그대로 둔다", () => {
    expect(leadingSentences("짧은 문장이다.", 80)).toBe("짧은 문장이다.");
  });

  it("상한을 넘기지 않는 완전한 문장까지만 담는다", () => {
    const text = "첫 문장이다. 두 번째 문장은 조금 더 길고 여기서 잘리면 조각이 남는다.";
    expect(leadingSentences(text, 20)).toBe("첫 문장이다.");
    // 상한이 넉넉하면 두 번째 문장까지 담는다.
    expect(leadingSentences(text, 60)).toBe(text);
  });

  it("첫 문장이 상한보다 길면 어절 경계에서 자른다", () => {
    const out = leadingSentences("아주 길고 긴 하나의 문장이 계속 이어지다가 끝난다.", 15);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(16);
  });

  it("문장 경계가 없으면 어절 경계에서 자르고 생략 기호를 남긴다", () => {
    const out = leadingSentences("가나다 라마바 사아자 차카타 파하가 나다라", 12);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("  ");
  });

  it("연속 공백·줄바꿈을 한 칸으로 정리한다", () => {
    expect(leadingSentences("가나다\n\n  라마바", 80)).toBe("가나다 라마바");
  });
});

describe("buildEmailContext", () => {
  const pr = {
    title: "가제",
    headlines: ["헤드라인 1안"],
    // 80자(BODY_FACT_FALLBACK_CHARS)를 넘겨야 절단 경로를 검사할 수 있다.
    body:
      "본문 첫 문장이다. 본문 두 번째 문장은 조금 더 길게 이어진다. " +
      "세 번째 문장은 상한을 확실히 넘기도록 충분히 길게 늘려 쓴 문장이다. 네 번째 문장.",
    who: "큐레잇",
  };

  it("숫자 근거가 있으면 그것을 핵심 수치로 쓴다", () => {
    const ctx = buildEmailContext({ ...pr, numbers: "시드 10억 원" }, null);
    expect(ctx.bodyFact).toBe("시드 10억 원");
  });

  it("숫자 근거가 비어 있으면 본문을 문장 경계까지 잘라 쓴다", () => {
    const ctx = buildEmailContext({ ...pr, numbers: "   " }, null);
    // 문장 중간 조각이 아니라 완전한 문장으로 끝나야 한다(기존 slice(0,80)의 문제).
    expect(ctx.bodyFact.endsWith(".")).toBe(true);
    expect(ctx.bodyFact).not.toContain("…");
    // 상한(80자) 안에 들어가는 문장까지만 담고, 넘치는 문장은 버린다.
    expect(ctx.bodyFact.length).toBeLessThanOrEqual(80);
    expect(ctx.bodyFact).toContain("본문 첫 문장이다.");
    expect(ctx.bodyFact).not.toContain("네 번째");
  });

  it("프로필이 없으면 보도자료 who로 폴백한다", () => {
    expect(buildEmailContext(pr, null).companyName).toBe("큐레잇");
    expect(buildEmailContext(pr, { companyName: "크랩피치" }).companyName).toBe("크랩피치");
  });

  it("화자 이름·직함을 그대로 전달한다", () => {
    const ctx = buildEmailContext({ ...pr, spokesName: "홍길동", spokesTitle: "CTO" }, null);
    expect(ctx.spokesName).toBe("홍길동");
    expect(ctx.spokesTitle).toBe("CTO");
  });
});

describe("인용문 화자 조립", () => {
  const j = { beatPrimary: "벤처투자", outletCategory: "it" as const };

  it("이름 + 직함 순서로 조립한다(한국 보도자료 관행)", () => {
    const { body } = renderCustomTemplate("제목", "{{인용문}}", {
      ...EMAIL,
      quote: "더 정확한 자료를 드리겠습니다",
      spokesName: "홍길동",
      spokesTitle: "대표",
    }, j);
    expect(body).toContain('홍길동 대표는 "더 정확한 자료를 드리겠습니다"라고 밝혔습니다.');
  });

  it("이름을 모르면 직함만 쓰고 빈 자리를 남기지 않는다", () => {
    const { body } = renderCustomTemplate("제목", "{{인용문}}", {
      ...EMAIL,
      quote: "코멘트",
      spokesTitle: "CTO",
    }, j);
    expect(body).toContain('CTO는 "코멘트"라고 밝혔습니다.');
    expect(body).not.toMatch(/ {2}/);
  });

  it("인용문이 없으면 빈 문자열이다", () => {
    const { body } = renderCustomTemplate("제목", "본문{{인용문}}", EMAIL, j);
    expect(body).toContain("본문");
    expect(body).not.toContain("밝혔습니다");
  });
});
