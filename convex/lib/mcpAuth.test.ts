import { describe, expect, it } from "vitest";
import {
  isPaidPlan,
  planAllowsMcp,
  planAllowsSkill,
  skillsForPlan,
  upgradeRequiredMessage,
  MCP_TOOL_SKILL,
  PLAN_LIMITS,
  SKILL_IDS,
} from "./plans";
import { buildUserMcpSnippet, generateMcpKey } from "./mcpAuth";

describe("planAllowsMcp", () => {
  it("무료도 MCP에 연결할 수 있다 — 제한은 도구 단위로 건다", () => {
    expect(planAllowsMcp("free")).toBe(true);
    expect(PLAN_LIMITS.free.mcp).toBe(true);
    // 연결이 되는 것과 유료인 것은 별개다.
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

describe("MCP 스킬 권한", () => {
  it("무료는 보도자료 작성 하나뿐이다", () => {
    expect(skillsForPlan("free")).toEqual(["press-release-writer"]);
  });

  it("무료에서 나머지 셋은 잠긴다", () => {
    for (const skill of ["media-kit-builder", "journalist-outreach", "reply-handler"] as const) {
      expect(planAllowsSkill("free", skill)).toBe(false);
    }
  });

  it("유료 플랜은 전부 열린다", () => {
    for (const plan of ["solo", "growth", "agency"] as const) {
      expect(skillsForPlan(plan)).toEqual([...SKILL_IDS]);
    }
  });

  it("알 수 없는 플랜·미지정은 무료로 떨어진다 — 실패 시 좁은 쪽", () => {
    expect(skillsForPlan(undefined)).toEqual(["press-release-writer"]);
    expect(planAllowsSkill("enterprise", "journalist-outreach")).toBe(false);
  });

  it("무료에 열리는 도구는 보도자료 작성 계열뿐이다", () => {
    // 자기 원고를 쓰고 자기 캠페인 현황을 보는 것까지 — 기자 데이터도 발송 인프라도
    // 건드리지 않는 범위다. 이 목록이 늘어나면 왜 늘었는지 여기서 드러나야 한다.
    const free = Object.entries(MCP_TOOL_SKILL)
      .filter(([, skill]) => planAllowsSkill("free", skill))
      .map(([tool]) => tool)
      .sort();
    expect(free).toEqual([
      "crabpitch_campaign_create",
      "crabpitch_campaign_list",
      "crabpitch_campaign_status",
      "crabpitch_press_guide",
    ]);
  });

  it("매칭·초안·승인·발송은 무료에 열리지 않는다", () => {
    // 이 넷은 기자 데이터와 발송 인프라를 모두 쓴다 — MCP는 자동화 창구이므로
    // 무료로 열어 두면 남용 비용이 곧바로 커진다.
    for (const tool of [
      "crabpitch_campaign_match",
      "crabpitch_match_select",
      "crabpitch_drafts_generate",
      "crabpitch_drafts_approve",
      "crabpitch_campaign_send",
    ]) {
      expect(planAllowsSkill("free", MCP_TOOL_SKILL[tool])).toBe(false);
      expect(planAllowsSkill("solo", MCP_TOOL_SKILL[tool])).toBe(true);
    }
  });

  it("게이트 대상 도구는 전부 담당 스킬이 등록돼 있다", () => {
    // 도구를 늘리고 MCP_TOOL_SKILL에 넣지 않으면 게이트가 통째로 빠진다.
    for (const skill of Object.values(MCP_TOOL_SKILL)) {
      expect(SKILL_IDS).toContain(skill);
    }
  });

  it("안내 문구는 웹앱 우회로를 함께 알린다", () => {
    const msg = upgradeRequiredMessage("journalist-outreach");
    expect(msg).toContain("웹앱");
    expect(msg).toContain("crabpitch_press_guide");
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
