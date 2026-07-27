/**
 * 사실 대조 — 보도자료 본문을 **미디어킷(단일 소스)** 과 맞춰 본다.
 *
 * 규칙 검사(`pressLint`)가 잡는 것은 "이 표현을 써도 되는가"다. 여기서 잡는 것은
 * "이 문장이 우리가 이미 확정해 둔 사실과 다른가"다. 실무에서 실제로 사고가 나는 두 지점만
 * 다룬다.
 *
 *  ① 보일러플레이트 표류 — 배포본마다 회사 소개를 조금씩 고쳐 쓰다 보면 설립연도·직원 수·
 *     사업 정의가 릴리스마다 달라진다. 기자가 과거 기사와 대조하는 순간 신뢰를 잃는다.
 *     미디어킷의 보일러플레이트가 **단일 소스**이고, 본문은 그것을 그대로 실어야 한다.
 *
 *  ② 팩트시트에 없는 수치 — 초안을 다듬는 과정(특히 LLM 보강)에서 원본에 없던 숫자가
 *     새로 생기는 일이 있다. 본문 수치는 팩트시트 수치의 **부분집합**이어야 한다.
 *
 * ⚠️ 둘 다 warn-only다. 팩트시트가 비어 있으면 ②는 아예 돌리지 않는다 —
 *    근거가 없는데 "근거 없음"을 경고하면 전부 오탐이 된다.
 * ⚠️ LLM을 쓰지 않는 결정적 코드다. 판정 근거를 사용자에게 그대로 보여줄 수 있어야 한다.
 */

import { normalizeForCompare, textSimilarity } from "./textSimilarity";

/* ── ① 보일러플레이트 단일 소스 대조 ─────────────────────────── */

/** 표류로 볼 최저 유사도 — 이보다 낮으면 "고쳐 쓴 것"이 아니라 "아예 없는 것"으로 본다. */
export const BOILERPLATE_DRIFT_MIN = 0.5;

/** 이 값 이상이면 사실상 같은 문단으로 보고 통과시킨다(조사·띄어쓰기 차이 허용). */
export const BOILERPLATE_MATCH_MIN = 0.95;

export type BoilerplateVerdict = "ok" | "drifted" | "missing" | "skipped";

export interface BoilerplateCheck {
  verdict: BoilerplateVerdict;
  /** 본문에서 가장 비슷했던 문단과의 유사도(0~1) */
  similarity: number;
  /** 가장 비슷했던 문단 — 사용자에게 "이 부분이 다릅니다"로 보여준다 */
  closestParagraph?: string;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * 본문이 미디어킷 보일러플레이트를 그대로 싣고 있는가.
 *
 * 문단 단위로 본다. 보일러플레이트는 통째로 붙여 넣는 한 덩어리이고, 문장 단위로 쪼개면
 * "설립연도만 바뀐 경우"가 나머지 문장의 일치에 묻혀 통과해 버린다.
 */
export function checkBoilerplate(body: string, canonical?: string): BoilerplateCheck {
  const canon = (canonical ?? "").trim();
  // 너무 짧은 보일러플레이트는 어느 문단과도 우연히 겹친다 — 대조 대상으로 삼지 않는다.
  if (normalizeForCompare(canon).length < 20) return { verdict: "skipped", similarity: 0 };

  const normalizedBody = normalizeForCompare(body);
  if (normalizedBody.includes(normalizeForCompare(canon))) {
    return { verdict: "ok", similarity: 1 };
  }

  let best = 0;
  let closest: string | undefined;
  for (const p of paragraphs(body)) {
    const sim = textSimilarity(p, canon);
    if (sim > best) {
      best = sim;
      closest = p;
    }
  }

  if (best >= BOILERPLATE_MATCH_MIN) return { verdict: "ok", similarity: best, closestParagraph: closest };
  if (best >= BOILERPLATE_DRIFT_MIN) {
    return { verdict: "drifted", similarity: best, closestParagraph: closest };
  }
  return { verdict: "missing", similarity: best };
}

/* ── ② 본문 수치 ⊆ 팩트시트 수치 ─────────────────────────────── */

/** 자릿수 접두 — 「3만 명」의 실제 값은 30000이다. */
const MAGNITUDES: Record<string, number> = { 천: 1e3, 만: 1e4, 억: 1e8, 조: 1e12 };

/**
 * 주장에 해당하는 단위만 본다.
 *
 * 날짜·기간(년/월/일/개월/분기…)은 여기 없다. 그런 숫자는 팩트시트에 적을 성질이 아니라서
 * 넣는 순간 전부 오탐이 된다 — 아래 `DURATION_PATTERN`으로 먼저 지운다.
 */
const UNIT_ALTERNATION =
  "%p|%|퍼센트포인트|퍼센트|원|달러|명|건|개사|곳|대|종|회|배|개|가구|팀|장|권|편|점";

/** 기간·날짜 표현 — 수치 추출 전에 지운다. 긴 표현을 먼저 두어야 「분기」가 「분」에 먹히지 않는다. */
const DURATION_PATTERN =
  /\d[\d,]*(?:\.\d+)?\s*(?:분기|주년|년도|년간|년째|개월|일간|일째|시간|년|월|일|주차|주|시|분|초|차)/g;

const CLAIM_PATTERN = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)\\s*(조|억|만|천)?\\s*(${UNIT_ALTERNATION})?`,
  "g",
);

export interface NumericClaim {
  /** 자릿수 접두를 곱한 실제 값 */
  value: number;
  /** 정규화된 단위. 단위 없이 자릿수만 붙은 「3억」은 빈 문자열 */
  unit: string;
  /** 원문 그대로 — 사용자에게 어디가 문제인지 보여줄 때 쓴다 */
  raw: string;
}

function canonicalUnit(unit: string | undefined): string {
  if (!unit) return "";
  if (unit === "퍼센트포인트") return "%p";
  if (unit === "퍼센트") return "%";
  return unit;
}

/**
 * 텍스트에서 주장성 수치를 뽑는다.
 * 자릿수 접두(조/억/만/천)나 단위 중 **최소 하나**는 있어야 주장으로 본다.
 * 맨숫자("3", "2 가지 방법")는 세지 않는다 — 팩트시트에 올릴 값이 아니다.
 */
export function extractNumericClaims(text: string): NumericClaim[] {
  const cleaned = text.replace(DURATION_PATTERN, " ");
  const out: NumericClaim[] = [];
  for (const m of cleaned.matchAll(CLAIM_PATTERN)) {
    const [raw, digits, magnitude, unit] = m;
    if (!magnitude && !unit) continue;
    const base = Number(digits!.replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    out.push({
      value: base * (magnitude ? MAGNITUDES[magnitude]! : 1),
      unit: canonicalUnit(unit),
      raw: raw.trim(),
    });
  }
  return out;
}

function covers(known: NumericClaim, claim: NumericClaim): boolean {
  if (known.value !== claim.value) return false;
  // 어느 한쪽이 단위 없는 값이면 값만 맞으면 근거가 있는 것으로 본다
  // (팩트시트에 「1억 2천만」처럼 단위를 뺀 채 적어 두는 일이 흔하다).
  return known.unit === claim.unit || known.unit === "" || claim.unit === "";
}

export interface UnsourcedNumberCheck {
  /** 팩트시트가 비어 있어 검사하지 않음 */
  skipped: boolean;
  /** 팩트시트에서 근거를 찾지 못한 수치 */
  unsourced: NumericClaim[];
}

/**
 * 본문 수치가 팩트시트 수치의 부분집합인지 본다.
 *
 * 팩트시트가 비어 있으면 검사 자체를 건너뛴다. 대조할 원본이 없는 상태에서
 * "출처 없음"을 띄우면 전부 오탐이고, 사용자는 경고 전체를 무시하게 된다.
 */
export function checkNumbersAgainstFactSheet(
  body: string,
  factSheet: Array<{ label?: string; value: string }> | undefined,
): UnsourcedNumberCheck {
  const rows = factSheet ?? [];
  if (rows.length === 0) return { skipped: true, unsourced: [] };

  const known = rows.flatMap((r) => extractNumericClaims(`${r.label ?? ""} ${r.value}`));
  if (known.length === 0) return { skipped: true, unsourced: [] };

  const seen = new Set<string>();
  const unsourced: NumericClaim[] = [];
  for (const claim of extractNumericClaims(body)) {
    if (known.some((k) => covers(k, claim))) continue;
    const key = `${claim.value}|${claim.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unsourced.push(claim);
  }
  return { skipped: false, unsourced };
}
