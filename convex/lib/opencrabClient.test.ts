import { describe, expect, it } from "vitest";
import { resolveOpenCrabTransport } from "./opencrabClient";

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
