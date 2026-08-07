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

/* ── 7일 쿨다운 ─────────────────────────────────────────────── */

/** 같은 기자에게 다시 보내기까지 비워야 하는 최소 간격. */
export const COOLDOWN_DAYS = 7;
export const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * 발송 테스트용 기자 레코드의 매체명.
 * `admin.seedTestJournalist`(플랫폼 관리자 전용)만 이 값을 넣는다.
 */
export const TEST_OUTLET = "테스트매체";

/**
 * 쿨다운을 면제할 **테스트 수신처**인지 판정.
 *
 * 쿨다운은 실제 기자를 반복 발송에서 보호하는 장치다. 그런데 관리자가 자기 주소로 만든
 * 테스트 레코드까지 함께 묶이면, 메일 문안을 고칠 때마다 7일을 기다리거나 매번 새 주소를
 * 만들어야 해서 발송 경로를 실물로 확인할 방법이 사실상 사라진다. 보호할 대상이 없는
 * 레코드이므로 여기서만 뺀다.
 *
 * 두 조건을 **모두** 만족해야 한다 — 팩에서 온 레코드가 매체명만 우연히 겹쳐 면제되는
 * 일이 없도록. `source: "manual"`은 관리자 시드만 붙이는 값이고(`seed.ts`의 데모 데이터는
 * `"seed"`, 팩 동기화는 `"opencrab"`), `TEST_OUTLET`은 실제 기자단 팩에 존재하지 않는다.
 *
 * ⚠️ 면제는 **쿨다운 한정**이다. 수신거부(억제 리스트)·표현 규정·발송 상한은 테스트
 *    레코드에도 그대로 적용된다 — 테스트라고 컴플라이언스 전제를 바꾸지 않는다.
 */
export function isTestRecipient(
  journalist: { outlet?: string; source?: string } | null | undefined,
): boolean {
  return journalist?.source === "manual" && journalist.outlet === TEST_OUTLET;
}

/**
 * 캠페인과 무관하게, 같은 기자에게 최근 발송한 이력이 있으면 제외한다.
 *
 * ⚠️ 판정 스코프는 **사용자 단위**다. `lastSentAt`에는 반드시 *해당 사용자의* 캠페인에 속한
 * 초안의 `sentAt`만 넣어야 한다(호출 측 책임 — `emailDrafts.by_user_journalist` 인덱스).
 * 전역 판정은 교차 테넌트 간섭을 만들 뿐 아니라 "다른 누군가가 이 기자에게 최근 발송했다"는
 * 사이드채널이 되므로 금지한다. suppression의 `by_user_email` 격리와 동형이다.
 *
 * `cooldownExempt`가 켜진 항목은 이력과 무관하게 통과시킨다 — 관리자가 만든 테스트
 * 수신처(`isTestRecipient`)에만 붙인다. 호출 측이 판정해서 넘긴다.
 *
 * @param now 판정 기준 시각
 * @returns sendable = 발송 가능, blocked = 쿨다운으로 제외(초안은 삭제하지 않고 사유만 기록)
 */
export function partitionByCooldown<T extends { lastSentAt?: number; cooldownExempt?: boolean }>(
  drafts: T[],
  now: number,
  cooldownMs: number = COOLDOWN_MS,
): { sendable: T[]; blocked: Array<T & { daysRemaining: number }> } {
  const sendable: T[] = [];
  const blocked: Array<T & { daysRemaining: number }> = [];
  for (const d of drafts) {
    if (d.cooldownExempt) {
      sendable.push(d);
      continue;
    }
    const last = d.lastSentAt;
    if (last === undefined || now - last >= cooldownMs) {
      sendable.push(d);
      continue;
    }
    const remainMs = cooldownMs - (now - last);
    blocked.push({ ...d, daysRemaining: Math.max(1, Math.ceil(remainMs / (24 * 60 * 60 * 1000))) });
  }
  return { sendable, blocked };
}

/** 쿨다운 제외 사유 문구(승인 화면 표시용 — 기자 실명·이메일 미포함). */
export function cooldownReason(daysRemaining: number): string {
  return `최근 ${COOLDOWN_DAYS}일 이내 발송 이력 — ${daysRemaining}일 후 발송 가능`;
}
