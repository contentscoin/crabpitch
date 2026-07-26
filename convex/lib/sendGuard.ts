/**
 * 발송 직전 컴플라이언스 가드.
 *
 * 매칭 시점에 억제 리스트를 걸러도, 초안 생성 → 실제 발송 사이에 기자가 수신거부하면
 * 그대로 나간다. 예약 발송은 이 창이 며칠까지 벌어진다. 그래서 **발송 시점에 한 번 더**
 * 억제 리스트를 대조한다. ("수신거부 시 즉시 억제, 다시는 발송하지 않는다" — 컴플라이언스 원칙)
 */

/** 억제 리스트 대조용 이메일 정규화 (대소문자·공백 차이로 새는 것 방지). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function suppressedEmailSet(emails: string[]): Set<string> {
  return new Set(emails.map(normalizeEmail));
}

/**
 * 발송 대상 초안을 억제 여부로 가른다.
 * @returns sendable = 발송 가능, blocked = 수신거부로 차단(발송하지 않고 초안으로 남긴다)
 */
export function partitionBySuppression<T extends { email: string }>(
  drafts: T[],
  suppressed: Set<string>,
): { sendable: T[]; blocked: T[] } {
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const d of drafts) {
    if (suppressed.has(normalizeEmail(d.email))) blocked.push(d);
    else sendable.push(d);
  }
  return { sendable, blocked };
}
