import { describe, expect, it } from "vitest";
import { isPaidPlan, planAllowsMcp, PLAN_LIMITS } from "./plans";
import { buildUserMcpSnippet, generateMcpKey } from "./mcpAuth";

describe("planAllowsMcp", () => {
  it("free는 MCP 불가", () => {
    expect(planAllowsMcp("free")).toBe(false);
    expect(PLAN_LIMITS.free.mcp).toBe(false);
    expect(isPaidPlan("free")).toBe(false);
  });

  it("유료 플랜은 MCP 가능", () => {
    for (const plan of ["solo", "growth", "agency"] as const) {
      expect(planAllowsMcp(plan)).toBe(true);
      expect(isPaidPlan(plan)).toBe(true);
      expect(PLAN_LIMITS[plan].mcp).toBe(true);
    }
  });

  it("알 수 없는 플랜은 거부", () => {
    expect(planAllowsMcp(undefined)).toBe(false);
    expect(planAllowsMcp("enterprise")).toBe(false);
  });
});

describe("mcpAuth", () => {
  it("cp_mcp_ 키를 생성한다", () => {
    const { raw, prefix } = generateMcpKey();
    expect(raw.startsWith("cp_mcp_")).toBe(true);
    expect(raw.length).toBeGreaterThan(20);
    expect(prefix).toBe(raw.slice(0, 16));
  });

  it("mcp.json 스니펫에 키 URL을 넣는다", () => {
    const snippet = buildUserMcpSnippet(
      "https://example.convex.site",
      "cp_mcp_abc",
    );
    const parsed = JSON.parse(snippet) as {
      mcpServers: { crabpitch: { url: string } };
    };
    expect(parsed.mcpServers.crabpitch.url).toBe(
      "https://example.convex.site/api/mcp/cp_mcp_abc",
    );
  });
});
