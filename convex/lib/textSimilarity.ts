/**
 * 본문 유사도 공통 척도.
 *
 * 팔로업 복붙 검사(`followUp`), 캠페인 내 메일 중복 검사(`campaignSimilarity`),
 * 보일러플레이트 표류 검사(`factCheck`)가 같은 척도를 쓴다. 각자 임계값만 다르다.
 */

/** 비교용 정규화 — 공백·문장부호를 걷어내고 글자만 남긴다. */
export function normalizeForCompare(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

/** 길이 n의 문자 shingle 집합. */
export function shingles(text: string, n = 6): Set<string> {
  const normalized = normalizeForCompare(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= normalized.length; i += 1) {
    out.add(normalized.slice(i, i + n));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 문장 집합 — 순서를 지우고 "어떤 문장을 재사용했는지"만 본다. */
export function sentenceSet(text: string): Set<string> {
  return new Set(
    text
      .split(/(?<=[.!?。])\s+|\n+/)
      .map((s) => normalizeForCompare(s))
      .filter((s) => s.length >= 4),
  );
}

/**
 * 두 본문의 유사도(0~1).
 *
 * 두 척도의 최댓값을 쓴다. 문자 shingle은 조사·어미만 손댄 재탕을 잡지만 **문장을
 * 재배열하면 경계가 깨져 값이 떨어진다**. 문장 집합은 그 반대다. 재탕은 둘 중 하나에는
 * 반드시 걸린다.
 */
export function textSimilarity(a: string, b: string): number {
  return Math.max(jaccard(shingles(a), shingles(b)), jaccard(sentenceSet(a), sentenceSet(b)));
}
