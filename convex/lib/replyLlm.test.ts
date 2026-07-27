import { describe, expect, it } from "vitest";
import { classifyReply } from "./replyClassifier";
import {
  EMAIL_PLACEHOLDER,
  maskReplyForLlm,
  needsLlmFallback,
  parseReplyClassification,
  PHONE_PLACEHOLDER,
  REPLY_LLM_INPUT_MAX_CHARS,
  replyClassifySystemPrompt,
  replyClassifyUserPrompt,
  resolveReplyClassification,
} from "./replyLlm";

/** 규칙이 어떤 신호도 못 잡는 회신 — LLM 폴백이 실제로 도는 유일한 입력이다. */
const UNMATCHED = "보내주신 건 잘 받았습니다. 저희 쪽에서 한번 살펴보겠습니다.";

describe("PII 마스킹", () => {
  it("이메일·전화번호를 자리표시자로 지운다", () => {
    const masked = maskReplyForLlm(
      "회신 주소는 kim.reporter@chosun.co.kr 이고 연락처는 010-1234-5678 입니다.",
    );
    expect(masked).toContain(EMAIL_PLACEHOLDER);
    expect(masked).toContain(PHONE_PLACEHOLDER);
    expect(masked).not.toContain("kim.reporter");
    // 도메인만으로도 기자가 좁혀지므로 packSync와 달리 도메인도 남기지 않는다
    expect(masked).not.toContain("chosun");
    expect(masked).not.toContain("1234");
  });

  it("여러 건·다양한 표기의 연락처를 모두 지운다", () => {
    const masked = maskReplyForLlm(
      "a@b.com, c.d+tag@news.co.kr / 01098765432 / 02-123-4567 / +82-10-1111-2222",
    );
    expect(masked).not.toMatch(/@/);
    expect(masked).not.toMatch(/[0-9]{4}/);
  });

  it("분류에 필요한 본문은 그대로 남긴다", () => {
    const masked = maskReplyForLlm("인터뷰 일정 조율하고 싶습니다. reporter@x.com");
    expect(masked).toContain("인터뷰 일정 조율하고 싶습니다.");
  });

  it("본문 속 수치·날짜는 전화번호로 오인하지 않는다", () => {
    const masked = maskReplyForLlm("2026-07-26 기준 매출 1,250,000,000원, 성장률 0.5%입니다.");
    expect(masked).not.toContain(PHONE_PLACEHOLDER);
  });

  it("입력 길이를 상한으로 잘라 호출 비용을 묶는다", () => {
    expect(maskReplyForLlm("가".repeat(5000))).toHaveLength(REPLY_LLM_INPUT_MAX_CHARS);
  });

  it("프롬프트에 마스킹된 본문만 실려 나간다", () => {
    const body = "연락은 kim@daum.net 으로 주세요.";
    const prompt = replyClassifyUserPrompt(maskReplyForLlm(body));
    expect(prompt).not.toContain("kim@daum.net");
    expect(prompt).toContain(EMAIL_PLACEHOLDER);
    // 자리표시자의 의미를 시스템 프롬프트가 설명해야 모델이 복원을 시도하지 않는다
    expect(replyClassifySystemPrompt()).toContain(EMAIL_PLACEHOLDER);
  });
});

describe("응답 파싱", () => {
  it("7유형 밖 응답은 통째로 버린다", () => {
    expect(parseReplyClassification('{"type":"spam"}')).toBeNull();
    expect(parseReplyClassification('{"type":"인터뷰"}')).toBeNull();
    expect(parseReplyClassification('{"type":null}')).toBeNull();
  });

  it("JSON이 아니면 null을 낸다", () => {
    expect(parseReplyClassification("인터뷰 요청 같습니다")).toBeNull();
    expect(parseReplyClassification("")).toBeNull();
  });

  it("코드펜스로 감싼 유효 응답을 읽는다", () => {
    const parsed = parseReplyClassification(
      '```json\n{"type":"materials","reason":"사진 요청"}\n```',
    );
    expect(parsed?.type).toBe("materials");
    expect(parsed?.reason).toBe("사진 요청");
  });

  it("하위 유형이 5종 밖이면 그 필드만 버린다", () => {
    const parsed = parseReplyClassification('{"type":"question","questionSubtype":"기타"}');
    expect(parsed?.type).toBe("question");
    expect(parsed?.questionSubtype).toBeUndefined();
  });
});

describe("LLM 호출 대상 판정", () => {
  it("규칙이 신호를 잡은 회신은 LLM을 태우지 않는다", () => {
    expect(needsLlmFallback(classifyReply("인터뷰 가능할까요?"))).toBe(false);
    expect(needsLlmFallback(classifyReply("앞으로 수신거부 부탁드립니다"))).toBe(false);
  });

  it("어느 규칙에도 안 걸린 회신만 LLM 대상이다", () => {
    expect(needsLlmFallback(classifyReply(UNMATCHED))).toBe(true);
  });
});

describe("수신거부 우선순위 (컴플라이언스)", () => {
  it("키워드가 수신거부를 잡으면 LLM이 뭐라 해도 수신거부다", () => {
    const r = resolveReplyClassification("앞으로 수신거부 부탁드립니다.", {
      type: "interview",
    });
    expect(r.type).toBe("unsubscribe");
    expect(r.source).toBe("rule");
  });

  it("키워드가 잡은 다른 유형도 LLM 제안이 뒤집지 못한다", () => {
    const r = resolveReplyClassification("보내주신 내용이 사실과 다릅니다.", {
      type: "published",
    });
    expect(r.type).toBe("complaint");
    expect(r.needsEscalation).toBe(true);
    expect(r.source).toBe("rule");
  });

  it("규칙 미매칭 회신을 LLM이 수신거부로 보면 수신거부로 확정한다", () => {
    // 억제 리스트 등록은 이 유형만 보고 서버 뮤테이션이 강제한다(경로 무관)
    const r = resolveReplyClassification(UNMATCHED, { type: "unsubscribe" });
    expect(r.type).toBe("unsubscribe");
    expect(r.source).toBe("llm");
  });
});

describe("폴백 병합", () => {
  it("제안이 없으면 규칙 결과를 그대로 쓴다", () => {
    const r = resolveReplyClassification(UNMATCHED, null);
    expect(r.type).toBe("question");
    expect(r.source).toBe("rule");
  });

  it("파싱 실패 응답은 규칙 결과로 되돌아간다", () => {
    const r = resolveReplyClassification(UNMATCHED, parseReplyClassification("응답 없음"));
    expect(r).toEqual({ type: "question", source: "rule" });
  });

  it("7유형 밖 응답도 규칙 결과로 되돌아간다", () => {
    const r = resolveReplyClassification(
      UNMATCHED,
      parseReplyClassification('{"type":"newsletter"}'),
    );
    expect(r.type).toBe("question");
    expect(r.source).toBe("rule");
  });

  it("유효한 제안은 미매칭 회신에 반영한다", () => {
    const r = resolveReplyClassification(UNMATCHED, { type: "hold", reason: "완곡한 거절" });
    expect(r).toEqual({ type: "hold", source: "llm" });
  });

  it("LLM 경로 컴플레인도 담당자 확인 대상이다", () => {
    const r = resolveReplyClassification(UNMATCHED, { type: "complaint" });
    expect(r.needsEscalation).toBe(true);
  });

  it("LLM 경로 부정 맥락 질문도 담당자 확인 대상이다", () => {
    const r = resolveReplyClassification(UNMATCHED, {
      type: "question",
      questionSubtype: "negative",
    });
    expect(r.questionSubtype).toBe("negative");
    expect(r.needsEscalation).toBe(true);
  });

  it("하위 유형이 빠지면 키워드 하위 분류로 메운다", () => {
    const r = resolveReplyClassification("이 부분 배경이 궁금해서 여쭙니다.", {
      type: "question",
    });
    expect(r.questionSubtype).toBe("intent");
    expect(r.source).toBe("llm");
  });
});
