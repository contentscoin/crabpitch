/**
 * 플랜별 발송 후보 한도(`matchReveal`) 적용.
 *
 * 기획서 §6.3: Free는 매칭 미리보기(상위 N명)를 보되 **발송 후보로 선택은 3명까지**,
 * 나머지는 잠금 상태로 남기고 업그레이드를 유도한다.
 * 잠금은 "이메일 가리기"가 아니라 **후보 수 제한**이다 — 실명·이메일은 어느 플랜에서도
 * 화면에 나오지 않는다(PII 원칙).
 */

export interface Scored {
  score: number;
  /** 연락처 신뢰도가 낮으면 한도와 무관하게 기본 제외 */
  lowConfidence: boolean;
}

export interface GateResult {
  /** 발송 후보로 포함(included=true) */
  includedCount: number;
  /** 한도 초과로 잠긴 수 */
  lockedCount: number;
}

/**
 * 점수 내림차순으로 정렬된 후보에 한도를 적용해 included 플래그 배열을 만든다.
 * 신뢰도 low는 한도를 소모하지 않고 항상 제외한다.
 */
export function applyMatchReveal<T extends Scored>(
  scoredDesc: T[],
  matchReveal: number,
): { flags: boolean[]; result: GateResult } {
  const flags: boolean[] = [];
  let used = 0;
  let locked = 0;

  for (const item of scoredDesc) {
    if (item.lowConfidence) {
      flags.push(false);
      continue;
    }
    if (used < matchReveal) {
      flags.push(true);
      used += 1;
    } else {
      flags.push(false);
      locked += 1;
    }
  }

  return { flags, result: { includedCount: used, lockedCount: locked } };
}
