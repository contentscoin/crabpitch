/**
 * 기자 매칭 적합도 점수 — press-distribution 스킬의 랭킹 규칙을 코드로 흡수.
 *
 *  | 신호            | 배점 | 판단 기준                                        |
 *  |-----------------|------|--------------------------------------------------|
 *  | beat 일치       | 40   | beat_primary 정확 40 / beat_secondary 부분 25    |
 *  | 최근 유사 기사  | 25   | top_reference_title 이 주제와 유사               |
 *  | 기사 활동량     | 15   | reference_article_count 높을수록 가점            |
 *  | 연락처 신뢰도   | 15   | high 15 / medium 8 / low 3                        |
 *  | 매체 급         | 5    | 타깃 독자 적합성                                  |
 */

export type Confidence = "high" | "medium" | "low";

export interface ScorableJournalist {
  name: string;
  outlet: string;
  beatPrimary: string;
  beatSecondary: string[];
  contactConfidence: Confidence;
  referenceArticleCount: number;
  topReferenceTitle?: string;
}

export interface ScoreResult {
  score: number;
  reason: string;
  breakdown: {
    beat: number;
    recent: number;
    activity: number;
    confidence: number;
    outlet: number;
  };
}

const MAJOR_OUTLETS = [
  "전자신문",
  "지디넷코리아",
  "매일경제",
  "한국경제",
  "조선일보",
  "중앙일보",
  "동아일보",
  "연합뉴스",
  "머니투데이",
  "서울경제",
  "블로터",
  "테크크런치",
];

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\/,·|~\-\s()[\]]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function overlapCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  let n = 0;
  for (const t of new Set(a)) {
    if (setB.has(t)) n += 1;
    else if ([...setB].some((x) => x.includes(t) || t.includes(x))) n += 1;
  }
  return n;
}

export function scoreJournalist(
  j: ScorableJournalist,
  topicTags: string[],
): ScoreResult {
  const topicTokens = tokenize(topicTags.join(" "));

  // ① beat 일치 (40)
  const primaryTokens = tokenize(j.beatPrimary);
  const secondaryTokens = tokenize(j.beatSecondary.join(" "));
  const primaryHit = overlapCount(topicTokens, primaryTokens);
  const secondaryHit = overlapCount(topicTokens, secondaryTokens);
  let beat = 0;
  if (primaryHit >= 1) beat = Math.min(40, 25 + primaryHit * 8);
  else if (secondaryHit >= 1) beat = Math.min(25, 12 + secondaryHit * 6);

  // ② 최근 유사 기사 (25)
  let recent = 0;
  if (j.topReferenceTitle) {
    const refHit = overlapCount(topicTokens, tokenize(j.topReferenceTitle));
    recent = Math.min(25, refHit * 12);
  }

  // ③ 기사 활동량 (15)
  const activity = Math.min(15, Math.round((j.referenceArticleCount / 12) * 15));

  // ④ 연락처 신뢰도 (15)
  const confidence =
    j.contactConfidence === "high" ? 15 : j.contactConfidence === "medium" ? 8 : 3;

  // ⑤ 매체 급 (5)
  const outlet = MAJOR_OUTLETS.some((o) => j.outlet.includes(o)) ? 5 : 3;

  const score = Math.max(0, Math.min(100, beat + recent + activity + confidence + outlet));

  const reason = buildReason(j, { beat, recent, activity, confidence, outlet });
  return { score, reason, breakdown: { beat, recent, activity, confidence, outlet } };
}

function buildReason(
  j: ScorableJournalist,
  b: ScoreResult["breakdown"],
): string {
  const parts: string[] = [];
  if (b.beat >= 25) parts.push(`${j.beatPrimary} beat 일치`);
  else if (b.beat > 0) parts.push(`인접 beat(${j.beatSecondary[0] ?? j.beatPrimary})`);
  if (b.recent > 0 && j.topReferenceTitle)
    parts.push(`최근 '${truncate(j.topReferenceTitle, 22)}' 등 유사 주제 커버`);
  if (b.activity >= 10) parts.push(`기사 활동량 ${j.referenceArticleCount}건`);
  if (j.contactConfidence === "high") parts.push("연락처 신뢰도 high");
  return parts.length ? parts.join(", ") : "주제 관련도 낮음 — 후보 검토 필요";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
