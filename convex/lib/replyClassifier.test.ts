import { describe, expect, it } from "vitest";
import { buildReplyDraft, classifyReply } from "./replyClassifier";

describe("replyClassifier", () => {
  it("수신거부를 최우선으로 분류한다", () => {
    const r = classifyReply("앞으로 수신거부 부탁드립니다");
    expect(r.type).toBe("unsubscribe");
  });

  it("인터뷰 요청을 분류한다", () => {
    expect(classifyReply("인터뷰 가능할까요?").type).toBe("interview");
  });

  it("수신거부 답장은 설득 없이 즉시 수용한다", () => {
    const draft = buildReplyDraft("unsubscribe");
    expect(draft).toContain("제외");
    expect(draft).not.toContain("다시");
  });
});

describe("응대 템플릿 변형", () => {
  it("모든 유형에 최소 1개, 수신거부는 정확히 1개의 변형이 있다", async () => {
    const { REPLY_TEMPLATE_VARIANTS } = await import("./replyClassifier");
    const types = Object.keys(REPLY_TEMPLATE_VARIANTS) as Array<keyof typeof REPLY_TEMPLATE_VARIANTS>;
    expect(types).toHaveLength(7);
    for (const t of types) {
      expect(REPLY_TEMPLATE_VARIANTS[t].length).toBeGreaterThanOrEqual(1);
      expect(REPLY_TEMPLATE_VARIANTS[t][0]!.id).toBe("default");
    }
    expect(REPLY_TEMPLATE_VARIANTS.unsubscribe).toHaveLength(1);
  });

  it("변형 지정 초안이 유형별 규칙을 지킨다", async () => {
    const { buildReplyDraftVariant } = await import("./replyClassifier");
    const proactive = buildReplyDraftVariant("interview", "proactive", {
      slots: ["7/29(화) 10시", "7/30(수) 14시", "7/31(목) 16시"],
    });
    expect(proactive).toContain("7/29(화) 10시");
    expect(proactive).toContain("질문지");
    // 수신거부는 어떤 변형을 요청해도 즉시 수용 단일 응답
    const unsub = buildReplyDraftVariant("unsubscribe", "whatever");
    expect(unsub).toContain("즉시 제외");
    expect(unsub).not.toContain("혹시");
  });

  it("모르는 변형 id는 default로 폴백한다", async () => {
    const { buildReplyDraftVariant, buildReplyDraft } = await import("./replyClassifier");
    expect(buildReplyDraftVariant("hold", "no-such-variant")).toBe(buildReplyDraft("hold"));
  });
});

describe("question 하위 분류와 에스컬레이션", () => {
  it("수치 검증 질문을 numbers로 분류한다", () => {
    const r = classifyReply("이 수치는 어떻게 산출하셨나요? 모수가 궁금합니다.");
    expect(r.type).toBe("question");
    expect(r.questionSubtype).toBe("numbers");
    expect(r.needsEscalation).toBeUndefined();
  });

  it("경쟁사 비교 질문을 competitor로 분류한다", () => {
    const r = classifyReply("경쟁사 대비 어떤 점이 다른지 확인 부탁드립니다.");
    expect(r.questionSubtype).toBe("competitor");
  });

  it("부정적 맥락 질문은 담당자 확인 대상으로 표시한다", () => {
    const r = classifyReply("최근 논란이 있던데 사실인가요?");
    expect(r.type).toBe("question");
    expect(r.questionSubtype).toBe("negative");
    expect(r.needsEscalation).toBe(true);
  });

  it("컴플레인은 항상 담당자 확인 대상이다", () => {
    const r = classifyReply("보내주신 내용이 사실과 다릅니다.");
    expect(r.type).toBe("complaint");
    expect(r.needsEscalation).toBe(true);
  });

  it("수신거부는 다른 신호가 섞여도 최우선으로 분류한다", () => {
    const r = classifyReply("인터뷰는 어렵고요, 앞으로 수신거부 부탁드립니다.");
    expect(r.type).toBe("unsubscribe");
  });

  it("어떤 신호로 분류됐는지 알려준다", () => {
    const r = classifyReply("인터뷰 가능한 시간 알려주세요.");
    expect(r.matched).toBe("인터뷰");
  });
});

describe("응대 초안 — 약속한 자료만", () => {
  it("보도자료에 등록된 링크만 나열한다", () => {
    const draft = buildReplyDraft("materials", {
      links: ["https://example.com/kit", "https://example.com/img.zip"],
    });
    expect(draft).toContain("https://example.com/kit");
    expect(draft).toContain("https://example.com/img.zip");
  });

  it("등록된 링크가 없으면 지키지 못할 약속 대신 안내를 남긴다", () => {
    const draft = buildReplyDraft("materials", {});
    expect(draft).toContain("실제 보유한 자료만");
    expect(draft).not.toContain("(링크)");
  });

  it("질문 3단 스캐폴드에 공식 답변·대체 표현·금지 표현이 모두 있다", () => {
    const draft = buildReplyDraft("question", { questionSubtype: "competitor" });
    expect(draft).toContain("[공식 답변]");
    expect(draft).toContain("[대체 표현");
    expect(draft).toContain("[이렇게는 말하지 않기]");
    expect(draft).toContain("부당비교광고");
  });

  it("보류 응대는 자동 재접근 금지를 명시한다", () => {
    const draft = buildReplyDraft("hold");
    expect(draft).toContain("자동으로 다시 접근하지 않습니다");
  });

  it("게재 통보 응대는 인용 정확성 점검을 안내한다", () => {
    const draft = buildReplyDraft("published");
    expect(draft).toContain("보내기 전 확인");
  });
});
