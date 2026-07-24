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
