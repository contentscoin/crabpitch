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
