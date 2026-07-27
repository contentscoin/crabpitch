import { describe, expect, it } from "vitest";
import {
  classifySyncStatus,
  extractChunks,
  isEmptyScopeResult,
  maskEmailsInText,
  outletCategoryFromOid,
  parseArticleDateFromText,
  parseArticleDateFromUrl,
  parseBeatDistribution,
  parsePackListPayload,
  parsePackPayload,
  reassembleDocument,
  splitList,
  splitPipe,
} from "./packSync";

/**
 * 픽스처는 **익명화**했다 — 실제 팩의 기자 실명·이메일·연락처를 테스트에 넣지 않는다.
 * 구조(키 이름·파이프 구분 문자열·청크 분할)만 실제 팩과 동일하게 맞춘다.
 */
const DOC = {
  ontology: { subject: "journalist", resource: "contacts" },
  batch: 25,
  record_count: 2,
  reporters: [
    {
      outlet_name: "테스트일보",
      naver_oid: "030",
      reporter_name: "가나다",
      email: "reporter1@example.com",
      phone: "",
      contact_verification: "verified",
      contact_confidence: "high",
      contact_evidence_count: 3,
      contact_source_urls: "https://example.com/a?x=1,2|https://example.com/b/c",
      beat_primary: "IT/테크",
      beat_secondary: "스타트업|AI",
      beat_distribution: "IT/테크:7|스타트업:2|AI:1",
      classification_confidence: "high",
      reference_article_count: 2,
      reference_articles: [
        {
          title: "국내 AI 스타트업 투자 동향",
          url: "https://www.etnews.com/20260715000123",
          topic: "투자",
          official_popularity_rank: null,
        },
        { title: "클라우드 전환 가속", url: "https://zdnet.co.kr/view/?no=20260610090000", topic: "클라우드" },
      ],
      mailing_status: "approved",
    },
    {
      outlet_name: "테스트경제",
      naver_oid: "018",
      reporter_name: "라마바",
      email: "reporter2@example.com",
      contact_confidence: "medium",
      beat_primary: "핀테크",
      beat_secondary: "",
      reference_article_count: 0,
      reference_articles: [],
      mailing_status: "candidate",
    },
  ],
};

/** 원문을 지정한 경계로 잘라 evidence 청크 형태로 만든다(실제 응답과 동일하게 무손실 슬라이스). */
function toChunks(text: string, bounds: Array<[number, number]>, opts?: { shuffle?: boolean }) {
  const chunks = bounds.map(([from, to], i) => ({
    text: text.slice(from, to),
    metadata: { char_start: from, char_end: to, evidence_index: i, source_chunk_index: i },
  }));
  // 실제 응답은 관련도 순이라 순서가 섞여 온다
  return { evidence: opts?.shuffle ? [...chunks].reverse() : chunks };
}

describe("packSync 청크 재조립", () => {
  const text = JSON.stringify(DOC);
  const mid = Math.floor(text.length / 3);

  it("관련도 순으로 섞여 와도 char_start로 재정렬해 원문을 복원한다", () => {
    const payload = toChunks(text, [
      [0, mid],
      [mid, mid * 2],
      [mid * 2, text.length],
    ], { shuffle: true });
    const doc = reassembleDocument(extractChunks(payload));
    expect(doc.complete).toBe(true);
    expect(doc.text).toBe(text);
  });

  it("이어붙일 때 구분자를 넣지 않는다(토큰 중간 분할 보호)", () => {
    // JSON 키 한가운데를 자른다
    const cut = text.indexOf("reporter_name") + 5;
    const payload = toChunks(text, [
      [0, cut],
      [cut, text.length],
    ]);
    const doc = reassembleDocument(extractChunks(payload));
    expect(doc.text).toBe(text);
    expect(() => JSON.parse(doc.text)).not.toThrow();
  });

  it("청크 결손을 char_start 연속성으로 탐지한다", () => {
    const payload = toChunks(text, [
      [0, mid],
      [mid * 2, text.length], // 가운데 구간 누락
    ]);
    const doc = reassembleDocument(extractChunks(payload));
    expect(doc.complete).toBe(false);
    expect(doc.gaps).toEqual([{ from: mid, to: mid * 2 }]);
  });

  it("결손 문서는 파싱 실패로 partial 처리된다", () => {
    const payload = toChunks(text, [
      [0, mid],
      [mid * 2, text.length],
    ]);
    const parsed = parsePackPayload(payload);
    expect(parsed.complete).toBe(false);
    expect(parsed.reporters).toHaveLength(0);
    expect(parsed.parseError).toContain("파싱 실패");
    expect(classifySyncStatus(parsed.reporters.length, parsed.recordCount, parsed.complete)).toBe(
      "failed",
    );
  });
});

describe("packSync 문서 파싱", () => {
  it("reporters[]와 record_count·batch를 뽑는다", () => {
    const text = JSON.stringify(DOC);
    const parsed = parsePackPayload(toChunks(text, [[0, text.length]]));
    expect(parsed.complete).toBe(true);
    expect(parsed.recordCount).toBe(2);
    expect(parsed.batch).toBe(25);
    expect(parsed.reporters).toHaveLength(2);
  });

  it("선언 수보다 적게 파싱되면 partial", () => {
    expect(classifySyncStatus(2, 8, true)).toBe("partial");
    expect(classifySyncStatus(8, 8, true)).toBe("ok");
    expect(classifySyncStatus(0, 8, true)).toBe("failed");
  });

  it("스코프가 안 걸린 빈 응답을 예외 없이 판정한다", () => {
    // pack_query 경로는 예외 대신 evidence:[] 를 돌려준다
    expect(isEmptyScopeResult({ evidence: [], pack_scope: { documents: 0 } })).toBe(true);
    expect(isEmptyScopeResult({ evidence: [{ text: "x" }] })).toBe(false);
  });
});

describe("packSync 필드 파서", () => {
  it("파이프 구분 문자열만 자르고 URL을 보존한다", () => {
    const urls = splitPipe("https://example.com/a?x=1,2|https://example.com/b/c");
    expect(urls).toEqual(["https://example.com/a?x=1,2", "https://example.com/b/c"]);
  });

  it("파이프가 있으면 파이프로만 자른다 — 'IT/테크' 같은 값을 보호한다", () => {
    expect(splitList("IT/테크|스타트업")).toEqual(["IT/테크", "스타트업"]);
  });

  it("파이프가 없으면 레거시 다중 구분자로 자른다", () => {
    expect(splitList("투자, 벤처·핀테크")).toEqual(["투자", "벤처", "핀테크"]);
  });

  it("beat 분포 '라벨:개수|…' 문자열을 가중치 배열로 만든다", () => {
    expect(parseBeatDistribution("IT/테크:7|스타트업:2|AI:1")).toEqual([
      { beat: "IT/테크", weight: 7 },
      { beat: "스타트업", weight: 2 },
      { beat: "AI", weight: 1 },
    ]);
  });

  it("빈 문자열·미지원 형태는 undefined", () => {
    expect(parseBeatDistribution("")).toBeUndefined();
    expect(parseBeatDistribution(null)).toBeUndefined();
  });
});

describe("packSync 기사 날짜", () => {
  it("etnews·zdnet·newsis URL에서 발행일을 뽑는다", () => {
    const etnews = parseArticleDateFromUrl("https://www.etnews.com/20260715000123");
    expect(new Date(etnews!).getUTCMonth() + 1).toBe(7);
    expect(parseArticleDateFromUrl("https://zdnet.co.kr/view/?no=20260610090000")).toBeDefined();
    expect(parseArticleDateFromUrl("https://www.newsis.com/view/NISX20260501_0001")).toBeDefined();
  });

  it("날짜가 없으면 undefined — 없는 날짜를 지어내지 않는다", () => {
    expect(parseArticleDateFromUrl("https://example.com/article/hello")).toBeUndefined();
    expect(parseArticleDateFromUrl(undefined)).toBeUndefined();
  });

  it("텍스트 날짜도 파싱한다", () => {
    expect(parseArticleDateFromText("2026-07-15 보도")).toBeDefined();
    expect(parseArticleDateFromText("2026년 7월 15일")).toBeDefined();
    expect(parseArticleDateFromText("작년 여름")).toBeUndefined();
  });
});

describe("packSync 매체 유형", () => {
  it("확인된 OID만 분기하고 나머지는 general", () => {
    expect(outletCategoryFromOid("003")).toBe("newswire");
    expect(outletCategoryFromOid("030")).toBe("it");
    expect(outletCategoryFromOid("018")).toBe("economy");
    expect(outletCategoryFromOid("999")).toBe("general");
    expect(outletCategoryFromOid(undefined)).toBe("general");
  });

  it("3자리 미만 OID는 앞을 0으로 채워 매칭한다", () => {
    expect(outletCategoryFromOid("3")).toBe("newswire");
  });
});

describe("packSync 팩 목록·마스킹", () => {
  it("팩 목록에서 package_id를 뽑고 has_more로 완주를 판단한다", () => {
    const page = parsePackListPayload({
      packs: [
        { package_id: "p1", name: "korean-journalist-contacts-batch-001" },
        { id: "p2", title: "reference-pack", snapshot: { captured_at: "2026-07-21" } },
      ],
      has_more: true,
      next_cursor: "10",
    });
    expect(page.packs.map((p) => p.packageId)).toEqual(["p1", "p2"]);
    expect(page.packs[1]!.capturedAt).toBe("2026-07-21");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("10");
  });

  it("오류 메시지의 이메일을 마스킹한다(로그 경유 PII 유출 차단)", () => {
    const masked = maskEmailsInText("upsert failed for reporter1@example.com and b@c.co.kr");
    expect(masked).not.toContain("reporter1@example.com");
    expect(masked).toContain("re***@example.com");
    expect(masked).not.toContain("b@c.co.kr");
  });
});
