/**
 * PII 보호: 기자 실명·이메일·연락처는 화면에 절대 노출하지 않는다.
 * 클라이언트에는 실명 대신 안정적인 익명 코드(기자 #XXXX)만 내려보낸다.
 * 실제 이메일/실명은 서버(발송 시점)에서만 사용한다.
 */

/** 기자 문서 id로부터 안정적인 익명 표시 코드를 만든다(비가역·비식별). */
export function journalistCode(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `기자 #${tail || "----"}`;
}

/** 억제 리스트 등 최소 표시용 강한 마스킹(도메인까지 숨김). */
export function maskEmailStrong(email: string): string {
  const [local] = email.split("@");
  const head = (local ?? "").slice(0, 1);
  return `${head || "•"}${"•".repeat(6)}`;
}
