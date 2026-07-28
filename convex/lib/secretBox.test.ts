import { describe, expect, it } from "vitest";
import { importMasterKey, isSealed, openSecret, sealSecret } from "./secretBox";

/** `openssl rand -base64 32` 이 내놓는 것과 같은 형태 — 32바이트 base64. */
function randomMasterKeyB64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

describe("importMasterKey", () => {
  it("32바이트 base64 키를 받는다", async () => {
    await expect(importMasterKey(randomMasterKeyB64())).resolves.toBeTruthy();
  });

  it("앞뒤 공백은 잘라낸다 — 환경변수 붙여넣기에서 늘 생긴다", async () => {
    await expect(importMasterKey(` ${randomMasterKeyB64()}\n`)).resolves.toBeTruthy();
  });

  it("비어 있으면 만드는 방법까지 알려 준다", async () => {
    await expect(importMasterKey("")).rejects.toThrow(/openssl rand -base64 32/);
    await expect(importMasterKey("   ")).rejects.toThrow(/openssl rand -base64 32/);
  });

  it("base64가 아니면 거부한다", async () => {
    await expect(importMasterKey("not base64!!")).rejects.toThrow(/base64/);
  });

  it("짧은 키는 거부한다 — 엔트로피가 부족한 채로 암호화하면 안 된다", async () => {
    // "비밀번호처럼 생긴 문자열"을 그대로 키로 쓰는 실수를 막는다.
    const short = btoa("secret-key");
    await expect(importMasterKey(short)).rejects.toThrow(/32바이트/);
  });

  it("긴 키도 거부한다 — 조용히 잘라 쓰지 않는다", async () => {
    let s = "";
    for (const b of crypto.getRandomValues(new Uint8Array(64))) s += String.fromCharCode(b);
    await expect(importMasterKey(btoa(s))).rejects.toThrow(/32바이트/);
  });
});

describe("sealSecret / openSecret", () => {
  it("원문을 그대로 되살린다", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    const sealed = await sealSecret("abcd efgh ijkl mnop", key);
    expect(await openSecret(sealed, key)).toBe("abcd efgh ijkl mnop");
  });

  it("한글·이모지도 깨지지 않는다", async () => {
    // 앱 비밀번호는 ASCII지만 자체 메일서버 비밀번호는 무엇이든 들어온다.
    const key = await importMasterKey(randomMasterKeyB64());
    const plain = "비밀번호🔐 ünïcode";
    expect(await openSecret(await sealSecret(plain, key), key)).toBe(plain);
  });

  it("v1.{iv}.{ciphertext} 형식으로 저장한다", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    const parts = (await sealSecret("pw", key)).split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v1");
    // IV 12바이트 → base64 16자. 복호화에 필요하므로 반드시 함께 저장된다.
    expect(parts[1]).toHaveLength(16);
  });

  it("같은 값을 두 번 암호화해도 암호문이 다르다", async () => {
    // IV를 재사용하면 GCM은 평문이 드러난다. 매 호출 새로 만드는지 고정한다.
    const key = await importMasterKey(randomMasterKeyB64());
    const a = await sealSecret("same-password", key);
    const b = await sealSecret("same-password", key);
    expect(a).not.toBe(b);
    expect(await openSecret(a, key)).toBe(await openSecret(b, key));
  });

  it("빈 값은 암호화하지 않는다", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    await expect(sealSecret("", key)).rejects.toThrow();
  });
});

describe("openSecret 실패 처리", () => {
  it("다른 키로는 열리지 않는다", async () => {
    const k1 = await importMasterKey(randomMasterKeyB64());
    const k2 = await importMasterKey(randomMasterKeyB64());
    const sealed = await sealSecret("pw", k1);
    // 마스터 키를 교체하면 기존 값은 전부 이 경로로 떨어진다 → 재연결 안내.
    await expect(openSecret(sealed, k2)).rejects.toThrow(/다시 연결/);
  });

  it("암호문이 변조되면 감지한다 — GCM 인증 태그", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    const sealed = await sealSecret("pw", key);
    const [v, iv, ct] = sealed.split(".");
    const flipped = ct[0] === "A" ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;
    await expect(openSecret(`${v}.${iv}.${flipped}`, key)).rejects.toThrow(/다시 연결/);
  });

  it("IV가 바뀌어도 감지한다", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    const [v, iv, ct] = (await sealSecret("pw", key)).split(".");
    const flipped = iv[0] === "A" ? `B${iv.slice(1)}` : `A${iv.slice(1)}`;
    await expect(openSecret(`${v}.${flipped}.${ct}`, key)).rejects.toThrow(/다시 연결/);
  });

  it("형식이 틀리면 복호화를 시도하지 않는다", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    for (const bad of ["", "plaintext-password", "v1.onlytwo", "v2.aaaa.bbbb"]) {
      await expect(openSecret(bad, key)).rejects.toThrow(/형식/);
    }
  });
});

describe("isSealed", () => {
  it("이 모듈이 만든 값만 참", async () => {
    const key = await importMasterKey(randomMasterKeyB64());
    expect(isSealed(await sealSecret("pw", key))).toBe(true);
  });

  it("평문은 거짓 — 마이그레이션 판별에 쓴다", () => {
    // base64 문자열에는 `.`이 없으므로 암호문과 평문이 섞일 여지가 없다.
    for (const plain of ["", "app-password", "v1", "v1.onlytwo", "v2.a.b"]) {
      expect(isSealed(plain)).toBe(false);
    }
  });
});
