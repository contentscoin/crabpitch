import { describe, expect, it } from "vitest";
import {
  buildAllProvidersInstallScript,
  buildInstallLoginBlock,
  CLI_SETUPS,
  detectHostOsFromUserAgent,
} from "./byoCli";

describe("byoCli", () => {
  it("세 CLI 설정을 제공한다", () => {
    expect(CLI_SETUPS.claude.npmPackage).toContain("claude-code");
    expect(CLI_SETUPS.chatgpt.loginCommand).toContain("codex");
    expect(CLI_SETUPS.gemini.cliName).toBe("gemini");
  });

  it("UA로 OS를 추정한다", () => {
    expect(detectHostOsFromUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe(
      "windows",
    );
    expect(detectHostOsFromUserAgent("Macintosh; Intel Mac OS X")).toBe("macos");
  });

  it("Windows용 PowerShell 블록을 만든다", () => {
    const b = buildInstallLoginBlock("chatgpt", "windows");
    expect(b.shell).toBe("powershell");
    expect(b.command).toContain("codex login");
  });

  it("유닉스 설치 스크립트에 shebang이 있다", () => {
    const s = buildAllProvidersInstallScript("macos");
    expect(s.filename).toContain(".sh");
    expect(s.content.startsWith("#!")).toBe(true);
    expect(s.content).toContain("codex login");
  });
});
