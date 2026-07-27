/**
 * 캠페인 내 메일 상호 유사도 — "개인화했다고 했는데 사실은 안 했다"를 잡는다.
 *
 * 한 캠페인의 메일은 **원래 대부분 같아야 한다**. 같은 보도자료를 알리는 것이고,
 * 인사·자료·행동요청·수신거부는 공통 골격이다. 그래서 본문 전체를 비교하면 항상 0.9를 넘고
 * 아무 정보도 주지 못한다.
 *
 * 실제로 봐야 하는 것은 **초안마다 달라야 하는 구간**이다. 그 구간을 템플릿 구조로 파싱하려
 * 들면 프리셋 4종 + 커스텀 템플릿마다 규칙이 갈라져 반드시 어긋난다. 대신 구조를 전혀 모르는
 * 방식으로 구한다 — **모든 초안에 똑같이 등장하는 줄을 지우고 남는 것**이 개인화 구간이다.
 *
 * ⚠️ warn-only다. 발송을 막지 않는다. 전부 똑같이 보내는 것이 의도된 경우(동일 매체 유형만
 *    골라 보내는 일괄 공지 등)가 실제로 있고, 그 판단은 사용자가 한다.
 * ⚠️ 기자 실명은 초안에 저장되지 않으므로 이 검사에 PII가 들어오지 않는다.
 */

import { normalizeForCompare, textSimilarity } from "./textSimilarity";

/**
 * 이 값 이상이면 두 개인화 구간을 사실상 같은 문장으로 본다.
 *
 * ⚠️ 높게 잡은 것은 의도다. 개인화 구간은 한두 문장(50자 안팎)뿐이라, 문자 shingle 유사도로
 *    "같은 후킹을 어미만 바꿔 쓴 것"과 "다른 기사를 인용했지만 템플릿 꼬리가 같은 것"을
 *    분리할 수 없다(전자 ≈0.68, 후자 ≈0.5로 겹친다). 임계값을 낮추면 정상 초안이 걸린다.
 *
 *    그래도 실효가 있는 이유는 실제 중복이 **정확히 같은 문자열**로 나오기 때문이다.
 *    `personalHook`은 근거 기사가 없으면 beat 기반 generic 문구로 폴백하므로, 같은 출입처
 *    기자끼리는 후킹이 바이트 단위로 일치한다. 사람이 한 건만 손으로 고쳐 쓴 경우는
 *    이 검사가 잡지 못한다 — 그건 경고할 만한 실패도 아니다.
 */
export const CAMPAIGN_DUP_THRESHOLD = 0.9;

/** 초안이 이만큼은 있어야 검사한다 — 2건 이하는 "다양성"을 논할 표본이 아니다. */
export const MIN_DRAFTS_FOR_CHECK = 3;

/** 쌍 비교는 이 개수까지만 한다(O(n²) 상한). 초과분은 앞에서부터 자른다. */
export const MAX_COMPARED_DRAFTS = 60;

export interface CampaignSimilarityReport {
  status: "pass" | "warn" | "skipped";
  draftCount: number;
  /** 공통 줄을 걷어낸 뒤 서로 구별되는 개인화 구간의 가짓수 */
  distinctVariants: number;
  /** 개인화 구간 쌍 유사도의 최댓값(0~1) */
  maxPairSimilarity: number;
  /** 개인화 구간이 사실상 같은 초안 쌍의 수 */
  duplicatePairs: number;
  /** 공통 줄을 걷어내면 아무것도 남지 않는 초안 수 */
  emptyPersonalization: number;
  /** 사용자에게 그대로 보여줄 문구 */
  notes: string[];
}

function contentLines(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * 모든 초안에 공통으로 등장하는 줄.
 * 인사·자료·행동요청·서명·수신거부가 여기 걸려 빠진다. 구분선(`──`)처럼 짧은 줄도 마찬가지다.
 */
function sharedLineSet(bodies: string[]): Set<string> {
  if (bodies.length === 0) return new Set();
  const [first, ...rest] = bodies;
  let shared = new Set(contentLines(first!).map(normalizeForCompare));
  for (const body of rest) {
    const here = new Set(contentLines(body).map(normalizeForCompare));
    shared = new Set([...shared].filter((l) => here.has(l)));
    if (shared.size === 0) break;
  }
  return shared;
}

/** 공통 줄을 걷어낸 나머지 — 이 초안에서만 나타나는 문장들. */
export function personalizedRegion(body: string, shared: Set<string>): string {
  return contentLines(body)
    .filter((l) => !shared.has(normalizeForCompare(l)))
    .join("\n");
}

/**
 * 캠페인 초안들의 개인화 정도를 판정한다.
 * 본문만 받는다 — 초안 id도, 기자 정보도 필요 없다.
 */
export function checkCampaignSimilarity(bodies: string[]): CampaignSimilarityReport {
  const base: CampaignSimilarityReport = {
    status: "skipped",
    draftCount: bodies.length,
    distinctVariants: bodies.length,
    maxPairSimilarity: 0,
    duplicatePairs: 0,
    emptyPersonalization: 0,
    notes: [],
  };
  if (bodies.length < MIN_DRAFTS_FOR_CHECK) return base;

  const sampled = bodies.slice(0, MAX_COMPARED_DRAFTS);
  const shared = sharedLineSet(sampled);
  const regions = sampled.map((b) => personalizedRegion(b, shared));

  const empty = regions.filter((r) => normalizeForCompare(r).length === 0).length;
  const distinct = new Set(regions.map(normalizeForCompare)).size;

  let maxSim = 0;
  let dupPairs = 0;
  for (let i = 0; i < regions.length; i += 1) {
    for (let k = i + 1; k < regions.length; k += 1) {
      const a = regions[i]!;
      const b = regions[k]!;
      // 양쪽 다 비어 있으면 유사도 1로 본다 — 개인화가 전혀 없는 상태다.
      const sim =
        normalizeForCompare(a).length === 0 && normalizeForCompare(b).length === 0
          ? 1
          : textSimilarity(a, b);
      if (sim > maxSim) maxSim = sim;
      if (sim >= CAMPAIGN_DUP_THRESHOLD) dupPairs += 1;
    }
  }

  // 심한 것부터 하나만 고른다 — 같은 사실을 세 가지로 바꿔 말하면 읽지 않는다.
  const notes: string[] = [];
  if (empty === sampled.length) {
    notes.push(
      `초안 ${sampled.length}건이 문장 단위로 완전히 동일합니다. 개인화가 적용되지 않았습니다.`,
    );
  } else if (distinct === 1) {
    notes.push(
      `초안 ${sampled.length}건의 개인화 구간이 모두 같습니다. 기자별 후킹이 반영되지 않았습니다.`,
    );
  } else if (dupPairs > 0) {
    notes.push(
      `개인화 구간이 사실상 같은 초안이 ${dupPairs}쌍 있습니다. 근거 기사가 없어 출입처 기반 문구로 폴백된 기자인지 확인하세요.`,
    );
  }

  return {
    status: notes.length > 0 ? "warn" : "pass",
    draftCount: bodies.length,
    distinctVariants: distinct,
    maxPairSimilarity: maxSim,
    duplicatePairs: dupPairs,
    emptyPersonalization: empty,
    notes,
  };
}
