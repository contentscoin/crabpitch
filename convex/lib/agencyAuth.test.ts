import { describe, expect, it } from "vitest";
import { generateApiKey, sha256Hex } from "./agencyAuth";

describe("agencyAuth", () => {
  it("API 키는 cp_live_ 접두사와 16자 prefix를 가진다", () => {
    const { raw, prefix } = generateApiKey();
    expect(raw.startsWith("cp_live_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, 16));
    expect(raw.length).toBeGreaterThan(20);
  });

  it("sha256Hex는 안정적인 64자 hex를 반환한다", async () => {
    const a = await sha256Hex("cp_live_test");
    const b = await sha256Hex("cp_live_test");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("다른 입력은 다른 해시를 만든다", async () => {
    const a = await sha256Hex("a");
    const b = await sha256Hex("b");
    expect(a).not.toBe(b);
  });
});
