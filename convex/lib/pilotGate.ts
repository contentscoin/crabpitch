/**
 * 파일럿 게이트 — "아무도 읽지 않은 캠페인"을 통째로 보류한다.
 *
 * 한 번의 클릭으로 수십 통이 나가는 구조에서 가장 비싼 사고는 컴플라이언스 위반이 아니라
 * **톤이 어긋난 초안이 전량 그대로 나가는 것**이다. 규칙 검사는 금칙어·수치·구조만 보고,
 * "이 문장이 이 기자에게 말이 되는가"는 사람만 판정할 수 있다. 그래서 발송 확정 전
 * 최소 1건을 실제로 열어 확인하게 강제한다.
 *
 * 게이트가 아니라 **보류**다 — 초안은 지우지 않고 캠페인을 승인 단계로 되돌린다.
 */

/**
 * 초안이 이 개수 이상일 때만 파일럿 승인을 요구한다.
 * 1건짜리 캠페인은 발송 버튼을 누르는 행위 자체가 그 초안을 본 행위이므로 면제한다.
 */
export const PILOT_GATE_MIN_DRAFTS = 2;

/** 발송 확정 전 파일럿 승인이 필요한 상태인가. */
export function needsPilotApproval(drafts: Array<{ approvedAt?: number }>): boolean {
  if (drafts.length < PILOT_GATE_MIN_DRAFTS) return false;
  return !drafts.some((d) => d.approvedAt !== undefined);
}

/** 사용자 대면 경로에서 던질 안내 문구 — 무엇을 눌러야 풀리는지까지 적는다. */
export function pilotGateMessage(total: number): string {
  return `초안 ${total}건 중 아직 한 건도 확인하지 않았습니다. 초안 목록에서 하나를 펼쳐 내용을 읽고 ‘이 초안 확인함’을 누른 뒤 다시 시도하세요.`;
}
