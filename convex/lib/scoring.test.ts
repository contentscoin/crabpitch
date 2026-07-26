import { describe, expect, it } from "vitest";
import { scoreJournalist } from "./scoring";

describe("scoreJournalist", () => {
  const base = {
    name: "테스트",
    outlet: "전자신문",
    beatPrimary: "AI/데이터",
    beatSecondary: ["SaaS"],
    contactConfidence: "high" as const,
    referenceArticleCount: 12,
    topReferenceTitle: "국내 AI 스타트업 기술 동향",
  };

  it("주제 beat와 일치하면 높은 점수", () => {
    const r = scoreJournalist(base, ["AI", "SaaS", "스타트업"]);
    expect(r.score).toBeGreaterThan(50);
    expect(r.breakdown.beat).toBeGreaterThan(0);
    expect(r.breakdown.confidence).toBe(15);
    expect(r.breakdown.outlet).toBe(5);
  });

  it("무관 주제면 낮은 점수", () => {
    const r = scoreJournalist(
      { ...base, beatPrimary: "뷰티", beatSecondary: [], topReferenceTitle: undefined },
      ["반도체", "파운드리"],
    );
    expect(r.score).toBeLessThan(40);
  });
});

describe("팩 신호 반영 (S4)", () => {
  const NOW = Date.UTC(2026, 6, 26, 12);
  const DAY = 24 * 60 * 60 * 1000;
  const base = {
    name: "테스트",
    outlet: "테스트일보",
    beatPrimary: "IT/테크",
    beatSecondary: ["스타트업"],
    contactConfidence: "medium" as const,
    referenceArticleCount: 2,
    source: "opencrab",
  };

  it("주력 beat 일치가 주변 beat 일치보다 높다", () => {
    // beat 이름이 서로 부분 문자열이면(예: 'IT/테크'와 '핀테크') 토큰 매칭이 둘 다 걸린다.
    // 분포 가중의 효과만 보려고 겹치지 않는 이름을 쓴다.
    const dist = [
      { beat: "유통", weight: 8 },
      { beat: "반도체", weight: 2 },
    ];
    const main = scoreJournalist({ ...base, beatDistribution: dist }, ["유통"], NOW);
    const side = scoreJournalist({ ...base, beatDistribution: dist }, ["반도체"], NOW);
    expect(main.breakdown.beat).toBeGreaterThan(side.breakdown.beat);
  });

  it("근거 기사 여러 건 중 가장 잘 맞는 것으로 판단한다", () => {
    const r = scoreJournalist(
      {
        ...base,
        referenceArticles: [
          { title: "무관한 유통 기사" },
          { title: "반도체 파운드리 증설", publishedAt: NOW - 10 * DAY },
        ],
      },
      ["반도체"],
      NOW,
    );
    expect(r.breakdown.recent).toBeGreaterThan(0);
    expect(r.reason).toContain("반도체");
  });

  it("오래된 기사는 최근 기사보다 낮게 본다", () => {
    const article = (publishedAt: number) => ({
      ...base,
      referenceArticles: [{ title: "반도체 파운드리 증설", publishedAt }],
    });
    const fresh = scoreJournalist(article(NOW - 10 * DAY), ["반도체"], NOW);
    const old = scoreJournalist(article(NOW - 500 * DAY), ["반도체"], NOW);
    expect(old.breakdown.recent).toBeLessThan(fresh.breakdown.recent);
  });

  it("발행일을 모르는 기사는 깎지 않는다", () => {
    const known = scoreJournalist(
      { ...base, referenceArticles: [{ title: "반도체 증설", publishedAt: NOW - 10 * DAY }] },
      ["반도체"],
      NOW,
    );
    const unknown = scoreJournalist(
      { ...base, referenceArticles: [{ title: "반도체 증설" }] },
      ["반도체"],
      NOW,
    );
    expect(unknown.breakdown.recent).toBe(known.breakdown.recent);
  });

  it("적은 기사 수 구간에서도 변별된다", () => {
    const one = scoreJournalist({ ...base, referenceArticleCount: 1 }, ["IT"], NOW);
    const three = scoreJournalist({ ...base, referenceArticleCount: 3 }, ["IT"], NOW);
    expect(three.breakdown.activity).toBeGreaterThan(one.breakdown.activity);
  });

  it("연락처 근거 개수는 가산만 하고 등급 배점을 깎지 않는다", () => {
    const plain = scoreJournalist({ ...base, contactConfidence: "high" }, ["IT"], NOW);
    const evidenced = scoreJournalist(
      { ...base, contactConfidence: "high", contactEvidenceCount: 3 },
      ["IT"],
      NOW,
    );
    expect(plain.breakdown.confidence).toBe(15);
    expect(evidenced.breakdown.confidence).toBe(15);
    const medium = scoreJournalist({ ...base, contactEvidenceCount: 3 }, ["IT"], NOW);
    expect(medium.breakdown.confidence).toBe(11);
  });

  it("확인된 naver_oid는 매체 급 판정에 쓰인다", () => {
    const known = scoreJournalist({ ...base, naverOid: "030" }, ["IT"], NOW);
    const unknown = scoreJournalist({ ...base, naverOid: "999" }, ["IT"], NOW);
    expect(known.breakdown.outlet).toBe(5);
    expect(unknown.breakdown.outlet).toBe(3);
  });
});

describe("신선도 감점 (S3)", () => {
  const NOW = Date.UTC(2026, 6, 26, 12);
  const DAY = 24 * 60 * 60 * 1000;
  const base = {
    name: "테스트",
    outlet: "테스트일보",
    beatPrimary: "IT/테크",
    beatSecondary: [],
    contactConfidence: "high" as const,
    referenceArticleCount: 3,
    source: "opencrab",
  };

  it("최근 확인된 레코드는 감점하지 않는다", () => {
    const r = scoreJournalist({ ...base, lastSeenInPackAt: NOW - 5 * DAY }, ["IT"], NOW);
    expect(r.breakdown.stalePenalty).toBe(0);
  });

  it("오래 미확인된 레코드는 감점하고 사유를 남긴다", () => {
    const r = scoreJournalist({ ...base, lastSeenInPackAt: NOW - 120 * DAY }, ["IT"], NOW);
    expect(r.breakdown.stalePenalty).toBeLessThan(0);
    expect(r.reason).toContain("미확인");
  });

  it("감점에는 상한이 있다 — 제외는 관리자 스위치의 몫이다", () => {
    const r = scoreJournalist({ ...base, lastSeenInPackAt: NOW - 3000 * DAY }, ["IT"], NOW);
    expect(r.breakdown.stalePenalty).toBe(-12);
    expect(r.score).toBeGreaterThan(0);
  });

  it("팩 유래가 아닌 레코드는 감점 대상이 아니다", () => {
    const r = scoreJournalist(
      { ...base, source: "seed", lastSeenInPackAt: NOW - 3000 * DAY },
      ["IT"],
      NOW,
    );
    expect(r.breakdown.stalePenalty).toBe(0);
  });
});
