import { describe, expect, it } from "vitest";
import { assertCleanCredential, resolveOpenCrabTransport } from "./opencrabClient";

describe("opencrabClient transport", () => {
  it("ocm_ 키는 MCP 모드로 해석한다", () => {
    const t = resolveOpenCrabTransport(
      "https://opencrab.sh/api/mcp",
      "ocm_abc123",
    );
    expect(t.mode).toBe("mcp");
    expect(t.endpoint).toBe("https://opencrab.sh/api/mcp/ocm_abc123");
  });

  it("URL에 키가 포함된 MCP 경로를 그대로 쓴다", () => {
    const t = resolveOpenCrabTransport(
      "https://opencrab.sh/api/mcp/ocm_abc123",
      "ocm_abc123",
    );
    expect(t.mode).toBe("mcp");
    expect(t.endpoint).toContain("ocm_abc123");
  });

  it("일반 HTTP URL+키는 http 모드다", () => {
    const t = resolveOpenCrabTransport(
      "https://opencrab.sh/api/query",
      "sk_live_xxx",
    );
    expect(t.mode).toBe("http");
    expect(t.endpoint).toBe("https://opencrab.sh/api/query");
  });
});

describe("assertCleanCredential", () => {
  it("깨끗한 값은 통과", () => {
    expect(() =>
      assertCleanCredential("OPENCRAB_API_KEY", "ocm_YKA-kxI5PesK_ZJ9e9"),
    ).not.toThrow();
    expect(() =>
      assertCleanCredential("OPENCRAB_API_URL", "https://opencrab.sh/api/mcp"),
    ).not.toThrow();
  });

  it("--prod가 값에 섞이면 무엇이 문제인지 말한다", () => {
    // 실제 사고: 대시보드 입력창에 CLI 명령의 플래그까지 붙여넣어 팩 27개가
    // 전부 401로 실패했다. 화면에는 "Unauthorized"만 남아 원인이 안 보였다.
    expect(() =>
      assertCleanCredential("OPENCRAB_API_KEY", "ocm_YKA-kxI5PesK --prod"),
    ).toThrow(/--prod/);
    expect(() =>
      assertCleanCredential("OPENCRAB_API_URL", "https://opencrab.sh/api/mcp --prod"),
    ).toThrow(/--prod/);
  });

  it("단일 대시 플래그도 잡는다", () => {
    expect(() => assertCleanCredential("X", "value -v")).toThrow(/-v/);
  });

  it("플래그가 아닌 공백도 잡는다", () => {
    expect(() => assertCleanCredential("X", "ocm_abc def")).toThrow(/공백/);
  });

  it("키에 들어가는 대시·언더스코어는 통과시킨다", () => {
    // ocm_ 키는 -와 _를 포함한다. 이걸 플래그로 오인하면 정상 키가 막힌다.
    expect(() =>
      assertCleanCredential("K", "ocm_YKA-kxI5PesK_ZJ9e9eXJdGgOdsbqtU0YCcHn3yAEzo"),
    ).not.toThrow();
  });
});
