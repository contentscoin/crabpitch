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

export interface RawEmailAttachment {
  filename: string;
  /** 첨부 내용(텍스트). 현재 첨부는 보도자료 전문 텍스트뿐이라 바이너리는 받지 않는다. */
  text: string;
}

/**
 * 파라미터에 파일명을 싣는다.
 *
 * 한글 파일명은 ASCII가 아니라서 `filename="보도자료.txt"`로 그냥 넣으면 클라이언트마다
 * 다르게 깨진다. RFC 2231(`filename*=UTF-8''…`)이 표준이고 Gmail·Outlook·Apple Mail이
 * 모두 읽는다. RFC 2231을 모르는 오래된 클라이언트를 위해 ASCII 폴백을 함께 둔다.
 */
function filenameParams(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** 76자로 접은 base64 — RFC 2045가 정한 줄 길이 상한이다. */
function base64Lines(text: string): string {
  return (Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * 본문·첨부 어디에도 나타나지 않는 경계 문자열.
 *
 * 경계가 내용 안에 우연히 들어 있으면 메시지가 그 지점에서 잘린다. 난수를 쓰면 테스트가
 * 흔들리므로, 고정 접두사에서 시작해 **충돌할 때만** 늘린다.
 */
function pickBoundary(parts: string[]): string {
  let boundary = "==crabpitch-boundary==";
  while (parts.some((p) => p.includes(boundary))) boundary += "=";
  return boundary;
}

/** Gmail raw 메시지(base64url) 생성. */
export function buildRawEmail(opts: {
  to: string;
  from?: string;
  subject: string;
  body: string;
  attachments?: RawEmailAttachment[];
}): string {
  const attachments = (opts.attachments ?? []).filter((a) => a.filename && a.text);
  const headers = [
    `To: ${opts.to}`,
    opts.from ? `From: ${opts.from}` : undefined,
    `Subject: ${encodeSubject(opts.subject)}`,
    "MIME-Version: 1.0",
  ].filter((l) => l !== undefined);

  let raw: string;
  if (attachments.length === 0) {
    raw = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      opts.body,
    ].join("\r\n");
  } else {
    const boundary = pickBoundary([opts.body, ...attachments.map((a) => a.text)]);
    const parts = [
      [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        opts.body,
      ].join("\r\n"),
      ...attachments.map((a) =>
        [
          `--${boundary}`,
          `Content-Type: text/plain; charset="UTF-8"; ${filenameParams(a.filename)}`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; ${filenameParams(a.filename)}`,
          "",
          base64Lines(a.text),
        ].join("\r\n"),
      ),
    ];
    raw = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      ...parts,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

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
