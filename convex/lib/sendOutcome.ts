/**
 * 발송 결과 문구 — 전송 수단(Gmail 초안·SMTP)과 무관하게 **같은 말**을 쓴다.
 *
 * 예전에는 경로마다 문구를 따로 들고 있었다. 게이트가 같은데 설명이 다르면
 * 사용자는 수단에 따라 규칙이 다른 줄 안다.
 */

export interface BlockedCounts {
  blockedSuppressed: number;
  blockedCooldown: number;
  blockedCompliance: number;
  overCap: number;
  overMonthly: number;
}

/**
 * 게이트에서 제외된 건을 사용자에게 알린다.
 * 조용히 줄어든 건수만큼 사용자는 "왜 3건만 나갔지"를 되묻게 된다.
 */
export function excludedSummary(counts: BlockedCounts): string {
  const parts: string[] = [];
  if (counts.blockedSuppressed > 0) parts.push(`수신거부 ${counts.blockedSuppressed}건`);
  if (counts.blockedCooldown > 0) parts.push(`7일 쿨다운 ${counts.blockedCooldown}건`);
  if (counts.blockedCompliance > 0) parts.push(`표현 규정 ${counts.blockedCompliance}건`);
  if (counts.overCap > 0) parts.push(`캠페인 상한 ${counts.overCap}건`);
  if (counts.overMonthly > 0) parts.push(`월 한도 ${counts.overMonthly}건`);
  if (parts.length === 0) return "";
  return ` 제외: ${parts.join(" · ")}. 사유는 초안 목록에서 확인하세요.`;
}

/**
 * 발신자 헤더. 표시명에 `"`나 개행이 있으면 헤더가 깨지거나 주입에 쓰인다.
 * 통과시키지 않고 **버린다** — 표시명은 없어도 메일은 나가야 한다.
 */
export function fromHeader(email: string, fromName?: string): string {
  const name = (fromName ?? "").replace(/[\r\n"<>]/g, "").trim();
  return name ? `"${name}" <${email}>` : email;
}
