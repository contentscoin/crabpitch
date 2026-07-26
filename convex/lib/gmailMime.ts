/**
 * Gmail API users.drafts.create / users.messages.send 용 RFC 2822 raw 메시지 유틸.
 * ⚠️ Buffer 사용 — `"use node"` 액션에서만 import 할 것.
 */

/** UTF-8 제목 인코딩 (간단한 Base64 encoded-word). */
export function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

/** Gmail raw 메시지(base64url) 생성. */
export function buildRawEmail(opts: {
  to: string;
  from?: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    opts.from ? `From: ${opts.from}` : undefined,
    `Subject: ${encodeSubject(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.body,
  ].filter((l) => l !== undefined);

  const raw = lines.join("\r\n");
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const GMAIL_PR_LABEL = "언론홍보";
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
