/**
 * 동일 기자 재발송 쿨다운 (컴플라이언스: "동일 기자에게 7일 내 2회 이상 발송하지 않는다").
 *
 * 기자 테이블은 전역 공유이므로 쿨다운은 **사용자 단위**로 판단한다.
 * (A 사용자가 보낸 기록이 B 사용자를 막으면 안 된다.)
 */

export const COOLDOWN_DAYS = 7;
export const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** 마지막 발송 시각 기준으로 아직 쿨다운 중인가. */
export function isInCooldown(
  lastSentAt: number | null | undefined,
  now: number,
  cooldownMs: number = COOLDOWN_MS,
): boolean {
  if (lastSentAt == null) return false;
  return now - lastSentAt < cooldownMs;
}

/** 쿨다운 해제까지 남은 일수(올림). 쿨다운이 아니면 0. */
export function daysUntilSendable(
  lastSentAt: number | null | undefined,
  now: number,
  cooldownMs: number = COOLDOWN_MS,
): number {
  if (!isInCooldown(lastSentAt, now, cooldownMs)) return 0;
  return Math.ceil((cooldownMs - (now - (lastSentAt as number))) / (24 * 60 * 60 * 1000));
}

/**
 * 발송 후보를 쿨다운 여부로 가른다.
 * @param lastSentAtOf 기자별 마지막 발송 시각 조회 (없으면 null)
 */
export function partitionByCooldown<T>(
  items: T[],
  lastSentAtOf: (item: T) => number | null | undefined,
  now: number,
  cooldownMs: number = COOLDOWN_MS,
): { sendable: T[]; blocked: T[] } {
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const item of items) {
    if (isInCooldown(lastSentAtOf(item), now, cooldownMs)) blocked.push(item);
    else sendable.push(item);
  }
  return { sendable, blocked };
}
