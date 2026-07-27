/**
 * 기자 매칭 적합도 점수 — press-distribution 스킬의 랭킹 규칙을 코드로 흡수.
 *
 *  | 신호            | 배점 | 판단 기준                                                    |
 *  |-----------------|------|--------------------------------------------------------------|
 *  | beat 일치       | 40   | beat 분포 가중 일치(없으면 primary 40 / secondary 25)        |
 *  | 최근 유사 기사  | 25   | 근거 기사 다건 중 최고 일치 + 발행 시점 보정                  |
 *  | 기사 활동량     | 15   | 소량 구간에서 변별되는 곡선                                   |
 *  | 연락처 신뢰도   | 15   | confidence 등급 + 근거 개수 보정                              |
 *  | 매체 급         | 5    | naver_oid 판정 우선, 매체명 폴백                              |
 *  | (감점) 신선도   | -    | 팩에서 오래 확인되지 않은 레코드는 감점                        |
 */

import { NAVER_OID_CATEGORY } from "./packSync";

export type Confidence = "high" | "medium" | "low";

export interface ScorableJournalist {
  name: string;
  outlet: string;
  beatPrimary: string;
  beatSecondary: string[];
  contactConfidence: Confidence;
  referenceArticleCount: number;
  topReferenceTitle?: string;
  /* ── 팩 동기화로 채워지는 신호 (없으면 기존 동작) ── */
  beatDistribution?: Array<{ beat: string; weight: number }>;
  referenceArticles?: Array<{ title: string; topic?: string; publishedAt?: number }>;
  contactEvidenceCount?: number;
  naverOid?: string;
  /** 팩에서 마지막으로 확인된 시각 — 오래되면 감점 */
  lastSeenInPackAt?: number;
  source?: string;
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
    /** 신선도 감점(음수) */
    stalePenalty: number;
  };
}

/**
 * 매체명 폴백 목록. 1차 판정은 naver_oid로 하고, OID가 없는 레코드(seed·manual)만
 * 이름으로 판단한다 — 매체명 표기가 제각각이라 이름 매칭만으로는 신뢰하기 어렵다.
 */
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

/** 팩에서 이 기간 이상 확인되지 않으면 감점을 시작한다(승인 화면 배지와 같은 기준). */
export const STALE_AFTER_DAYS = 30;
/** 감점 상한 — 완전 제외는 관리자 스위치의 몫이고, 점수는 순위만 낮춘다. */
export const MAX_STALE_PENALTY = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * beat 점수 — 분포가 있으면 **어느 beat에 얼마나 비중이 있는지**까지 본다.
 * 주력 beat와 맞는 기자와, 가끔 다루는 beat와 맞는 기자를 같은 점수로 두면
 * 상위 후보가 뭉개진다.
 */
function scoreBeat(j: ScorableJournalist, topicTokens: string[]): number {
  const dist = j.beatDistribution;
  if (dist && dist.length > 0) {
    const total = dist.reduce((sum, d) => sum + Math.max(0, d.weight), 0);
    if (total > 0) {
      let best = 0;
      for (const d of dist) {
        if (overlapCount(topicTokens, tokenize(d.beat)) === 0) continue;
        const share = Math.max(0, d.weight) / total;
        best = Math.max(best, share);
      }
      // 주력(비중 60% 이상) 일치는 만점에 가깝고, 주변 beat 일치는 절반 아래로.
      if (best > 0) return Math.round(Math.min(40, 14 + best * 43));
    }
  }

  const primaryHit = overlapCount(topicTokens, tokenize(j.beatPrimary));
  const secondaryHit = overlapCount(topicTokens, tokenize(j.beatSecondary.join(" ")));
  if (primaryHit >= 1) return Math.min(40, 25 + primaryHit * 8);
  if (secondaryHit >= 1) return Math.min(25, 12 + secondaryHit * 6);
  return 0;
}

/**
 * 최근 기사 점수 — 근거 기사 여러 건 중 가장 잘 맞는 것으로 판단하고,
 * 발행 시점을 알 수 있으면 오래된 기사는 살짝 깎는다(모르면 깎지 않는다).
 */
function scoreRecent(
  j: ScorableJournalist,
  topicTokens: string[],
  now: number,
): { score: number; matchedTitle?: string } {
  const articles =
    j.referenceArticles && j.referenceArticles.length > 0
      ? j.referenceArticles
      : j.topReferenceTitle
        ? [{ title: j.topReferenceTitle }]
        : [];
  if (articles.length === 0) return { score: 0 };

  let best = 0;
  let matchedTitle: string | undefined;
  for (const a of articles.slice(0, 3)) {
    const hay = `${a.title} ${("topic" in a && a.topic) || ""}`;
    const hits = overlapCount(topicTokens, tokenize(hay));
    if (hits === 0) continue;
    let value = Math.min(25, hits * 12);
    const publishedAt = "publishedAt" in a ? a.publishedAt : undefined;
    if (publishedAt !== undefined) {
      const ageDays = (now - publishedAt) / DAY_MS;
      if (ageDays > 365) value *= 0.6;
      else if (ageDays > 180) value *= 0.8;
    }
    if (value > best) {
      best = value;
      matchedTitle = a.title;
    }
  }
  return { score: Math.round(best), matchedTitle };
}

/**
 * 활동량 점수.
 * 팩 실데이터는 기사 1~3건인 기자가 대다수여서, 12건을 만점으로 두던 기존 선형식은
 * 사실상 전원을 0~3점 구간에 몰아넣어 변별이 되지 않았다. 소량 구간을 넓게 편 곡선으로 바꾼다.
 */
export function activityScore(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 5;
  if (count === 2) return 8;
  if (count === 3) return 10;
  if (count <= 5) return 12;
  if (count <= 7) return 13;
  return 15;
}

/**
 * 연락처 신뢰도 — 등급 배점은 그대로 두고 근거 개수를 가산한다.
 * 등급 배점을 깎아 근거 자리를 만들면 근거 데이터가 없는 기존 레코드(seed·manual)가
 * 이유 없이 하락한다. 가산만 하고 상한에서 자른다.
 */
function scoreConfidence(j: ScorableJournalist): number {
  const base = j.contactConfidence === "high" ? 15 : j.contactConfidence === "medium" ? 8 : 3;
  const evidence = j.contactEvidenceCount ?? 0;
  const bonus = evidence >= 3 ? 3 : evidence === 2 ? 2 : evidence === 1 ? 1 : 0;
  return Math.min(15, base + bonus);
}

/** 매체 급 — 확인된 naver_oid를 우선하고, 없으면 매체명으로 폴백한다. */
function scoreOutlet(j: ScorableJournalist): number {
  if (j.naverOid) {
    const key = String(j.naverOid).trim().padStart(3, "0");
    return key in NAVER_OID_CATEGORY ? 5 : 3;
  }
  return MAJOR_OUTLETS.some((o) => j.outlet.includes(o)) ? 5 : 3;
}

/**
 * 신선도 감점 — 팩에서 오래 확인되지 않은 레코드는 이직·부서 이동으로 이메일이
 * 유효하지 않을 수 있다. 후보에서 아예 빼는 것은 관리자 스위치의 몫이고,
 * 점수는 순위만 낮춘다(경계값에서 갑자기 사라지는 것보다 낫다).
 */
export function stalePenalty(j: ScorableJournalist, now: number): number {
  if (j.source !== "opencrab") return 0;
  if (j.lastSeenInPackAt === undefined) return 0;
  const ageDays = (now - j.lastSeenInPackAt) / DAY_MS;
  if (ageDays <= STALE_AFTER_DAYS) return 0;
  const over = ageDays - STALE_AFTER_DAYS;
  return -Math.min(MAX_STALE_PENALTY, Math.round(over / 15) * 3);
}

export function scoreJournalist(
  j: ScorableJournalist,
  topicTags: string[],
  now: number = Date.now(),
): ScoreResult {
  const topicTokens = tokenize(topicTags.join(" "));

  const beat = scoreBeat(j, topicTokens);
  const { score: recent, matchedTitle } = scoreRecent(j, topicTokens, now);
  const activity = activityScore(j.referenceArticleCount);
  const confidence = scoreConfidence(j);
  const outlet = scoreOutlet(j);
  const penalty = stalePenalty(j, now);

  const score = Math.max(
    0,
    Math.min(100, beat + recent + activity + confidence + outlet + penalty),
  );

  const breakdown = { beat, recent, activity, confidence, outlet, stalePenalty: penalty };
  return { score, reason: buildReason(j, breakdown, matchedTitle, now), breakdown };
}

function buildReason(
  j: ScorableJournalist,
  b: ScoreResult["breakdown"],
  matchedTitle: string | undefined,
  now: number,
): string {
  const parts: string[] = [];

  if (b.beat >= 25) {
    const top = j.beatDistribution?.[0]?.beat ?? j.beatPrimary;
    parts.push(`${top} beat 일치`);
  } else if (b.beat > 0) {
    parts.push(`인접 beat(${j.beatSecondary[0] ?? j.beatPrimary})`);
  }

  if (b.recent > 0 && matchedTitle) {
    parts.push(`'${truncate(matchedTitle, 22)}' 등 유사 주제 커버`);
  }
  if (b.activity >= 10) parts.push(`기사 ${j.referenceArticleCount}건`);
  if (j.contactConfidence === "high") {
    parts.push(
      j.contactEvidenceCount
        ? `연락처 신뢰도 high(근거 ${j.contactEvidenceCount}건)`
        : "연락처 신뢰도 high",
    );
  }
  if (b.stalePenalty < 0 && j.lastSeenInPackAt !== undefined) {
    const days = Math.floor((now - j.lastSeenInPackAt) / DAY_MS);
    parts.push(`기자단 자료 미확인 ${days}일(감점 ${b.stalePenalty})`);
  }

  return parts.length ? parts.join(", ") : "주제 관련도 낮음 — 후보 검토 필요";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
