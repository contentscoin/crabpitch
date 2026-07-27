import { describe, expect, it } from "vitest";
import {
  parseEnhanceEmailResult,
  parseJsonObject,
  parsePolishPressResult,
  parsePressGeoFields,
  pressPolishSystemPrompt,
  SUBHEAD_MAX,
} from "./anthropicEnhance";
import { GEO_TARGETS } from "./pressGuide";

describe("anthropicEnhance parsers", () => {
  it("JSON 펜스에서 객체를 추출한다", () => {
    const obj = parseJsonObject('```json\n{"a":1}\n```');
    expect(obj).toEqual({ a: 1 });
  });

  it("메일 결과에 수신거부가 없으면 강제 삽입한다", () => {
    const r = parseEnhanceEmailResult(
      JSON.stringify({ subject: "[회사] 소식", body: "기자님, 안녕하세요.\n본문만" }),
      { subject: "x", body: "y" },
    );
    expect(r.subject).toContain("회사");
    expect(r.body).toContain("수신거부");
    expect(r.body).toContain("기자님");
  });

  it("보도자료 headlines를 3개로 채운다", () => {
    const r = parsePolishPressResult(
      JSON.stringify({ title: "타이틀", headlines: ["A"], body: "본문입니다." }),
      { title: "f", headlines: ["f"], body: "f" },
    );
    expect(r.headlines).toHaveLength(3);
    expect(r.body).toBe("본문입니다.");
  });
});

describe("보도자료 GEO 확장 필드", () => {
  const base = { title: "타이틀", headlines: ["A", "B", "C"], body: "본문입니다." };
  const fallback = { title: "f", headlines: ["f"], body: "f" };

  it("GEO 필드가 없으면 키 자체를 만들지 않는다(하위 호환)", () => {
    const r = parsePolishPressResult(JSON.stringify(base), fallback);
    expect(r).toEqual(base);
    expect("keyTakeaways" in r).toBe(false);
    expect("faq" in r).toBe(false);
    expect("subheads" in r).toBe(false);
  });

  it("keyTakeaways·faq·subheads를 파싱한다", () => {
    const r = parsePolishPressResult(
      JSON.stringify({
        ...base,
        keyTakeaways: ["요약 1", " 요약 2 ", "요약 3"],
        faq: [{ q: "언제 출시하나", a: "3월입니다." }],
        subheads: ["부제 하나", "부제 둘"],
      }),
      fallback,
    );
    expect(r.keyTakeaways).toEqual(["요약 1", "요약 2", "요약 3"]);
    expect(r.faq).toEqual([{ q: "언제 출시하나", a: "3월입니다." }]);
    expect(r.subheads).toEqual(["부제 하나", "부제 둘"]);
  });

  it("keyTakeaways는 정본 목표치(3)까지, 부제는 상한까지만 남긴다", () => {
    const r = parsePolishPressResult(
      JSON.stringify({
        ...base,
        keyTakeaways: ["1", "2", "3", "4", "5"],
        subheads: ["가", "나", "다"],
      }),
      fallback,
    );
    expect(r.keyTakeaways).toHaveLength(GEO_TARGETS.keyTakeaways);
    expect(r.subheads).toHaveLength(SUBHEAD_MAX);
  });

  it("FAQ 문항 수는 강제하지 않는다 — 1개만 와도 그대로 둔다", () => {
    expect(GEO_TARGETS.faqCount).toBeUndefined();
    const r = parsePressGeoFields({ faq: [{ q: "q1", a: "a1" }] });
    expect(r.faq).toHaveLength(1);
  });

  it("형태가 틀린 값은 조용히 버린다", () => {
    const r = parsePolishPressResult(
      JSON.stringify({
        ...base,
        keyTakeaways: "세 줄 요약",
        faq: [{ q: "질문만" }, "문자열", { q: "정상", a: "답변" }],
        subheads: [1, 2],
      }),
      fallback,
    );
    expect(r.keyTakeaways).toBeUndefined();
    expect(r.subheads).toBeUndefined();
    expect(r.faq).toEqual([{ q: "정상", a: "답변" }]);
    // GEO 필드가 깨져도 본문 결과는 폐기하지 않는다.
    expect(r.body).toBe("본문입니다.");
  });

  it("모델이 GEO 필드를 빼먹으면 fallback 값을 승계한다", () => {
    const r = parsePolishPressResult(JSON.stringify(base), {
      ...fallback,
      keyTakeaways: ["기존 요약"],
    });
    expect(r.keyTakeaways).toEqual(["기존 요약"]);
  });

  it("시스템 프롬프트가 확장 JSON 스키마를 지시한다", () => {
    const p = pressPolishSystemPrompt();
    expect(p).toContain("keyTakeaways");
    expect(p).toContain("faq");
    expect(p).toContain("subheads");
    // 개수 규정이 없는 FAQ에 임의 수치를 넣지 않는다.
    expect(p).toContain("문항 수 규정은 없다");
  });
});
