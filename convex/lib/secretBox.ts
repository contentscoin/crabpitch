/**
 * 대칭 암호화 — SMTP 비밀번호처럼 **원문이 필요한** 자격증명 보관용.
 *
 * 해시로는 안 된다. 발송 시점에 원문을 SMTP 서버에 넘겨야 하기 때문이다.
 * (MCP 키·API 키는 대조만 하면 되므로 해시가 맞고, 여기와 다른 문제다.)
 *
 * ⚠️ SMTP 비밀번호는 LLM API 키와 위험도가 다르다. Gmail 앱 비밀번호는 IMAP까지
 *    열려 있어 **과거 메일 전부를 읽을 수 있다.** DB만 유출돼도 사용자의 사적인
 *    메일이 통째로 노출되므로 평문 저장은 선택지가 아니다.
 *
 * AES-256-GCM. 인증 태그가 붙어 변조를 감지한다(CBC 같은 무인증 모드는 쓰지 않는다).
 * Convex 런타임의 Web Crypto만 사용해 `"use node"` 없이 뮤테이션에서도 쓸 수 있다.
 */

const ALGO = "AES-GCM";
/** GCM 권장 nonce 길이. 12바이트 미만은 안전 여유가 줄어든다. */
const IV_BYTES = 12;
/** 저장 포맷 식별자 — 알고리즘을 바꿔야 할 때 기존 값과 구분한다. */
const PREFIX = "v1";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// 반환형에 `ArrayBuffer`를 못 박는다 — 기본 `ArrayBufferLike`는 SharedArrayBuffer를
// 포함해서 Web Crypto의 BufferSource로 받아 주지 않는다.
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * 환경변수의 마스터 키를 CryptoKey로 만든다.
 *
 * 키는 **base64로 인코딩된 32바이트**여야 한다. 짧은 문자열을 그냥 받아 쓰면
 * 엔트로피가 낮은 키로 암호화하게 되므로, 형식을 강제하고 이유를 알려 준다.
 *
 * 생성: `openssl rand -base64 32`
 */
export async function importMasterKey(
  rawBase64: string,
  /** 오류 문구에 쓸 환경변수 이름 — 사용자가 무엇을 설정해야 하는지 바로 알 수 있어야 한다. */
  envName = "SMTP_ENCRYPTION_KEY",
): Promise<CryptoKey> {
  const key = rawBase64.trim();
  if (!key) {
    throw new Error(
      `${envName} 가 설정되지 않았습니다. \`openssl rand -base64 32\` 로 만들어 Convex 환경변수에 넣으세요.`,
    );
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(key);
  } catch {
    throw new Error(`${envName} 가 base64가 아닙니다. \`openssl rand -base64 32\` 출력을 그대로 넣으세요.`);
  }
  if (bytes.length !== 32) {
    throw new Error(
      `${envName} 는 32바이트여야 합니다(현재 ${bytes.length}바이트). \`openssl rand -base64 32\` 로 다시 만드세요.`,
    );
  }
  return crypto.subtle.importKey("raw", bytes, ALGO, false, ["encrypt", "decrypt"]);
}

/**
 * 암호문 포맷: `v1.{iv}.{ciphertext}` (각각 base64)
 *
 * IV를 함께 저장한다 — 비밀이 아니고, 복호화에 반드시 필요하다.
 * **호출마다 새 IV를 만든다.** 같은 IV를 재사용하면 GCM은 평문이 드러난다.
 */
export async function sealSecret(plain: string, key: CryptoKey): Promise<string> {
  if (!plain) throw new Error("빈 값은 암호화하지 않습니다.");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, data);
  return `${PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

/**
 * 복호화. 변조·키 불일치는 예외로 떨어진다(GCM 인증 태그).
 *
 * 마스터 키를 교체하면 기존 값은 전부 복호화에 실패한다. 그때 사용자에게
 * 재입력을 요구해야 하므로, 호출부는 이 예외를 "비밀번호 손상"으로 다뤄야 한다.
 */
export async function openSecret(sealed: string, key: CryptoKey): Promise<string> {
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    throw new Error("암호문 형식이 올바르지 않습니다.");
  }
  const iv = fromBase64(parts[1]);
  const cipher = fromBase64(parts[2]);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher);
  } catch {
    // 키 교체·DB 손상·변조 — 원인을 구분할 수 없고, 어느 쪽이든 재입력이 답이다.
    throw new Error("비밀번호를 복호화하지 못했습니다. 메일 계정을 다시 연결해 주세요.");
  }
  return new TextDecoder().decode(plain);
}

/** 저장된 값이 이 모듈이 만든 암호문인지 — 평문 마이그레이션 판별에 쓴다. */
export function isSealed(value: string): boolean {
  return value.startsWith(`${PREFIX}.`) && value.split(".").length === 3;
}
