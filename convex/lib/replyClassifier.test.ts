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
