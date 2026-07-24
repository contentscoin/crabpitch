/**
 * 인터뷰 일정 슬롯 유틸 — KST 기준 제안 3안.
 */

/** now 기준 영업시간대 슬롯 3개(내일 10:00 · 14:00 · 다음날 11:00 KST). */
export function defaultInterviewSlots(nowMs = Date.now()): [string, string, string] {
  const kstOffset = 9 * 60 * 60 * 1000;
  const local = new Date(nowMs + kstOffset);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();

  const slot = (dayOffset: number, hour: number) => {
    // KST wall time → UTC ms
    const utcMs = Date.UTC(y, m, d + dayOffset, hour - 9, 0, 0);
    const dt = new Date(utcMs + kstOffset);
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    const hh = String(dt.getUTCHours()).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${mm}-${dd} ${hh}:00 KST`;
  };

  return [slot(1, 10), slot(1, 14), slot(2, 11)];
}

export function formatInterviewConfirmDraft(slot: string): string {
  return `기자님, 관심 가져주셔서 감사합니다. ${slot} 일정으로 인터뷰 확정합니다.\n화상/전화/대면 중 원하시는 방식 알려주시면 맞춰 드리겠습니다. 필요 자료도 미리 보내드리겠습니다.`;
}
