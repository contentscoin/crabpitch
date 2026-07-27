import { describe, expect, it } from "vitest";
import {
  mediaKitEnhanceSystemPrompt,
  mediaKitEnhanceUserPrompt,
  mediaKitGenerateSystemPrompt,
  parseMediaKitDraft,
  parseMediaKitGaps,
  type MediaKitDraft,
} from "./mediaKitEnhance";
import { ASSET_POLICY_ITEMS, GEO_ASSET_RULES, PRESS_KIT_SECTIONS, WRITING_RULES } from "./pressGuide";

/** 액션(`aiActions.EMPTY_KIT`)이 넘기는 모양 — 신규 4필드가 없는 7필드 초안. */
const EMPTY_DRAFT: MediaKitDraft = {
  boilerplate: "",
  keyMessages: [],
  factSheet: [],
  narrative: "",
  spokesperson: "",
  quotes: [],
  contact: "",
};

describe("mediaKitEnhance 프롬프트", () => {
  it("생성 프롬프트가 신규 4섹션을 팩 상수 그대로 지시한다", () => {
    const p = mediaKitGenerateSystemPrompt();
    expect(p).toContain(PRESS_KIT_SECTIONS[0]); // ① 한 문장 정의
    expect(p).toContain(GEO_ASSET_RULES.filenamePattern);
    expect(p).toContain(GEO_ASSET_RULES.alt);
    expect(p).toContain(GEO_ASSET_RULES.caption);
    for (const item of ASSET_POLICY_ITEMS) expect(p).toContain(item);
    for (const key of ["oneLiner", "visuals", "assetPolicy", "coverage"]) expect(p).toContain(key);
  });

  it("검증 불가 정보는 창작 금지 — placeholder 규칙과 보도 창작 금지를 유지한다", () => {
    for (const p of [mediaKitGenerateSystemPrompt(), mediaKitEnhanceSystemPrompt()]) {
      expect(p).toContain(WRITING_RULES.unverifiablePlaceholder);
      expect(p).toContain("추측하지 말고"); // coverage
      expect(p).toContain("url을 비운다"); // visuals
    }
  });

  it("보강 프롬프트는 값이 있는 신규 필드만 보여 준다", () => {
    const bare = mediaKitEnhanceUserPrompt({ companyName: "크랩", ...EMPTY_DRAFT });
    expect(bare).not.toContain("visuals");
    expect(bare).not.toContain("coverage");

    const filled = mediaKitEnhanceUserPrompt({
      companyName: "크랩",
      ...EMPTY_DRAFT,
      oneLiner: "한 문장 정의",
      visuals: [{ label: "로고" }],
      coverage: [{ outlet: "물류신문", title: "기사" }],
    });
    expect(filled).toContain("visuals");
    expect(filled).toContain("oneLiner");
    expect(filled).toContain("물류신문");
  });
});

describe("parseMediaKitDraft — v2 필드", () => {
  it("신규 4필드를 읽고 placeholder를 지우지 않는다", () => {
    const raw = JSON.stringify({
      oneLiner: "크랩로지스는 창고 자동화 소프트웨어 회사다.",
      boilerplate: "회사 소개",
      keyMessages: ["메시지"],
      factSheet: [{ label: "설립", value: "2019년" }],
      narrative: "스토리",
      spokesperson: "김대표",
      quotes: ["인용"],
      visuals: [
        {
          label: "로고",
          url: "크랩로지스-크랩WMS-로고.png",
          alt: "크랩로지스 로고",
          caption: "국문 로고",
        },
      ],
      assetPolicy: { usageScope: "보도 목적 한정", credit: WRITING_RULES.unverifiablePlaceholder },
      coverage: [{ outlet: "물류신문", title: "기사 제목", url: "https://example.com/a" }],
      contact: "press@example.com",
    });
    const draft = parseMediaKitDraft(raw, EMPTY_DRAFT);
    expect(draft?.oneLiner).toContain("크랩로지스");
    expect(draft?.visuals).toHaveLength(1);
    expect(draft?.visuals?.[0].caption).toBe("국문 로고");
    expect(draft?.assetPolicy?.credit).toBe(WRITING_RULES.unverifiablePlaceholder);
    expect(draft?.assetPolicy?.modificationLimits).toBeUndefined();
    expect(draft?.coverage?.[0].outlet).toBe("물류신문");
  });

  it("모델이 신규 필드를 빠뜨리면 현재 킷 값을 유지한다", () => {
    const fallback: MediaKitDraft = {
      ...EMPTY_DRAFT,
      boilerplate: "기존 소개",
      oneLiner: "기존 한 문장",
      visuals: [{ label: "기존 로고" }],
      assetPolicy: { credit: "크랩로지스 제공" },
      coverage: [{ outlet: "기존 매체", title: "기존 기사" }],
    };
    const draft = parseMediaKitDraft(JSON.stringify({ boilerplate: "다듬은 소개" }), fallback);
    expect(draft?.boilerplate).toBe("다듬은 소개");
    expect(draft?.oneLiner).toBe("기존 한 문장");
    expect(draft?.visuals).toEqual([{ label: "기존 로고" }]);
    expect(draft?.assetPolicy).toEqual({ credit: "크랩로지스 제공" });
    expect(draft?.coverage).toEqual([{ outlet: "기존 매체", title: "기존 기사" }]);
  });

  it("식별 불가 항목은 버린다 — label 없는 비주얼·매체명 없는 보도", () => {
    const raw = JSON.stringify({
      boilerplate: "회사 소개",
      visuals: [{ url: "a-b-c.png" }, { label: "제품 사진" }],
      coverage: [{ title: "제목만" }, { outlet: "매체", title: "제목" }],
      assetPolicy: {},
    });
    const draft = parseMediaKitDraft(raw, EMPTY_DRAFT);
    expect(draft?.visuals).toEqual([{ label: "제품 사진" }]);
    expect(draft?.coverage).toEqual([{ outlet: "매체", title: "제목" }]);
    expect(draft?.assetPolicy).toBeUndefined();
  });

  it("한 문장 정의만 있어도 초안으로 인정한다", () => {
    const draft = parseMediaKitDraft(JSON.stringify({ oneLiner: "한 문장 정의" }), EMPTY_DRAFT);
    expect(draft?.oneLiner).toBe("한 문장 정의");
  });

  it("JSON이 아니면 null이다", () => {
    expect(parseMediaKitDraft("설명만 있는 응답", EMPTY_DRAFT)).toBeNull();
    expect(parseMediaKitGaps("설명만 있는 응답")).toEqual([]);
  });
});
