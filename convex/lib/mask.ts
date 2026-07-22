/** 무료 티어 업셀: 공개 한도를 넘는 기자 이메일은 블러 처리. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "••••••";
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}
