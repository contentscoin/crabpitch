import { describe, expect, it } from "vitest";
import {
  AI_PROVIDERS,
  buildOpenCrabMcpSnippet,
  buildSkillBootstrapPrompt,
  isAiProviderId,
  skillRawUrl,
} from "./byoAi";

describe("byoAi", () => {
  it("세 제공자를 정의한다", () => {
    expect(Object.keys(AI_PROVIDERS)).toEqual(["claude", "chatgpt", "gemini"]);
  });

  it("스킬 부트스트랩에 마스킹·스킬 URL을 포함한다", () => {
    const p = buildSkillBootstrapPrompt({
      skill: "press-release-writer",
      companyName: "큐레잇",
      headline: "시드 유치",
      topicTags: ["IT"],
    });
    expect(p).toContain("기자 #XXXX");
    expect(p).toContain(skillRawUrl("press-release-writer"));
    expect(p).toContain("큐레잇");
  });

  it("MCP 스니펫에 플레이스홀더 키를 넣는다", () => {
    const s = buildOpenCrabMcpSnippet("ocm_test");
    expect(JSON.parse(s).mcpServers.opencrab.url).toContain("ocm_test");
  });

  it("provider id 가드를 제공한다", () => {
    expect(isAiProviderId("claude")).toBe(true);
    expect(isAiProviderId("foo")).toBe(false);
  });
});
