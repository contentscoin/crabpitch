import { describe, expect, it } from "vitest";
import {
  extractMcpBearer,
  mcpSiteBase,
  tagsFromQuery,
} from "./mcpHttpAuth";

describe("extractMcpBearer", () => {
  it("path에 포함된 cp_mcp_ 키를 읽는다", () => {
    const req = new Request(
      "https://example.convex.site/api/mcp/cp_mcp_deadbeef",
    );
    expect(extractMcpBearer(req)).toBe("cp_mcp_deadbeef");
  });

  it("Bearer 헤더를 읽는다", () => {
    const req = new Request("https://example.convex.site/api/mcp", {
      headers: { Authorization: "Bearer cp_mcp_abc" },
    });
    expect(extractMcpBearer(req)).toBe("cp_mcp_abc");
  });

  it("x-api-key 헤더를 읽는다", () => {
    const req = new Request("https://example.convex.site/api/mcp", {
      headers: { "x-api-key": "cp_mcp_xyz" },
    });
    expect(extractMcpBearer(req)).toBe("cp_mcp_xyz");
  });

  it("?key= 쿼리를 읽는다", () => {
    const req = new Request(
      "https://example.convex.site/api/mcp?key=cp_mcp_q",
    );
    expect(extractMcpBearer(req)).toBe("cp_mcp_q");
  });

  it("키가 없으면 null", () => {
    const req = new Request("https://example.convex.site/api/mcp");
    expect(extractMcpBearer(req)).toBeNull();
  });

  it("path가 Bearer보다 우선한다", () => {
    const req = new Request(
      "https://example.convex.site/api/mcp/cp_mcp_path",
      { headers: { Authorization: "Bearer cp_mcp_header" } },
    );
    expect(extractMcpBearer(req)).toBe("cp_mcp_path");
  });
});

describe("tagsFromQuery", () => {
  it("쉼표·슬래시로 태그를 분리한다", () => {
    expect(tagsFromQuery("AI, SaaS / 스타트업")).toEqual([
      "AI",
      "SaaS",
      "스타트업",
    ]);
  });

  it("짧은 토큰은 버린다", () => {
    expect(tagsFromQuery("a, AI")).toEqual(["AI"]);
  });
});

describe("mcpSiteBase", () => {
  it("CONVEX_SITE_URL만 사용하고 끝 슬래시를 제거한다", () => {
    expect(
      mcpSiteBase({ CONVEX_SITE_URL: "https://foo.convex.site/" }),
    ).toBe("https://foo.convex.site");
  });

  it("없으면 placeholder", () => {
    expect(mcpSiteBase({})).toBe("https://YOUR_DEPLOYMENT.convex.site");
  });
});
