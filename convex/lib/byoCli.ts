/**
 * BYO AI CLI — 사용자 PC에 공식 CLI를 설치하고 브라우저 로그인 창을 띄우는 명령.
 * 웹앱은 OS에 소프트웨어를 직접 설치할 수 없으므로, 사용자가 실행할 스크립트/명령을 제공한다.
 */

import type { AiProviderId } from "./byoAi";

export type HostOs = "macos" | "windows" | "linux" | "unknown";

export interface CliProviderSetup {
  id: AiProviderId;
  label: string;
  cliName: string;
  /** npm 글로벌 패키지 (크로스플랫폼 공통) */
  npmPackage: string;
  /** 설치 후 브라우저 로그인 창을 여는 명령 */
  loginCommand: string;
  docsUrl: string;
  nativeInstall?: {
    macosLinux?: string;
    windowsPs1?: string;
  };
}

export const CLI_SETUPS: Record<AiProviderId, CliProviderSetup> = {
  claude: {
    id: "claude",
    label: "Claude Code CLI",
    cliName: "claude",
    npmPackage: "@anthropic-ai/claude-code",
    loginCommand: "claude",
    docsUrl: "https://code.claude.com/docs/en/install",
    nativeInstall: {
      macosLinux: "curl -fsSL https://claude.ai/install.sh | bash",
      windowsPs1: "irm https://claude.ai/install.ps1 | iex",
    },
  },
  chatgpt: {
    id: "chatgpt",
    label: "OpenAI Codex CLI",
    cliName: "codex",
    npmPackage: "@openai/codex",
    loginCommand: "codex login",
    docsUrl: "https://developers.openai.com/codex/cli",
    nativeInstall: {
      macosLinux: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    },
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini CLI",
    cliName: "gemini",
    npmPackage: "@google/gemini-cli",
    loginCommand: "gemini",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
};

export function detectHostOsFromUserAgent(ua: string): HostOs {
  const u = ua.toLowerCase();
  if (u.includes("windows")) return "windows";
  if (u.includes("mac os") || u.includes("macintosh")) return "macos";
  if (u.includes("linux") || u.includes("cros")) return "linux";
  return "unknown";
}

/** 터미널에 붙여넣는 한 줄/블록 설치+로그인 명령 */
export function buildInstallLoginBlock(
  provider: AiProviderId,
  os: HostOs,
): { title: string; shell: "bash" | "powershell"; command: string } {
  const setup = CLI_SETUPS[provider];
  if (os === "windows") {
    const native = setup.nativeInstall?.windowsPs1;
    const parts = [
      "# Node.js 22+ 권장 (https://nodejs.org)",
      native
        ? native
        : `npm install -g ${setup.npmPackage}`,
      setup.loginCommand,
    ];
    return {
      title: `${setup.label} 설치 + 로그인 (PowerShell)`,
      shell: "powershell",
      command: parts.join("\n"),
    };
  }

  const native = setup.nativeInstall?.macosLinux;
  const parts = [
    "# Node.js 22+ 권장 (https://nodejs.org)",
    native ? native : `npm install -g ${setup.npmPackage}`,
    setup.loginCommand,
  ];
  return {
    title: `${setup.label} 설치 + 로그인 (터미널)`,
    shell: "bash",
    command: parts.join("\n"),
  };
}

export function buildAllProvidersInstallScript(os: HostOs): {
  filename: string;
  content: string;
} {
  if (os === "windows") {
    return {
      filename: "crabpitch-byo-ai-setup.ps1",
      content: WINDOWS_SETUP_PS1,
    };
  }
  return {
    filename: "crabpitch-byo-ai-setup.sh",
    content: UNIX_SETUP_SH,
  };
}

const UNIX_SETUP_SH = `#!/usr/bin/env bash
# 크랩피치 BYO AI — Claude / Codex / Gemini CLI 설치 후 로그인 창 실행
# 사용: bash crabpitch-byo-ai-setup.sh [claude|chatgpt|gemini|all]
set -euo pipefail

TARGET="\${1:-all}"

need_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js가 필요합니다: https://nodejs.org (22+ 권장)"
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm이 필요합니다."
    exit 1
  fi
}

install_npm() {
  local pkg="$1"
  echo "→ npm install -g $pkg"
  npm install -g "$pkg"
}

run_login() {
  local name="$1"
  shift
  echo ""
  echo "=== $name 로그인 (브라우저 창이 열립니다) ==="
  "$@"
}

need_node

case "$TARGET" in
  claude)
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL https://claude.ai/install.sh | bash || install_npm @anthropic-ai/claude-code
    else
      install_npm @anthropic-ai/claude-code
    fi
    run_login "Claude Code" claude
    ;;
  chatgpt)
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL https://chatgpt.com/codex/install.sh | sh || install_npm @openai/codex
    else
      install_npm @openai/codex
    fi
    run_login "Codex (ChatGPT)" codex login
    ;;
  gemini)
    install_npm @google/gemini-cli
    run_login "Gemini" gemini
    ;;
  all)
    echo "세 CLI를 순서대로 설치·로그인합니다. (원치 않는 항목은 Ctrl+C)"
    "$0" claude || true
    "$0" chatgpt || true
    "$0" gemini || true
    ;;
  *)
    echo "Usage: $0 [claude|chatgpt|gemini|all]"
    exit 1
    ;;
esac

echo ""
echo "완료. 이후 크랩피치 웹의 「내 AI」에서 스킬 프롬프트를 복사해 CLI/앱에 붙여넣으세요."
`;

const WINDOWS_SETUP_PS1 = `# 크랩피치 BYO AI — Claude / Codex / Gemini CLI 설치 후 로그인 창 실행
# 사용 (PowerShell):
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\\crabpitch-byo-ai-setup.ps1 [-Provider claude|chatgpt|gemini|all]
param(
  [ValidateSet("claude","chatgpt","gemini","all")]
  [string]$Provider = "all"
)

function Ensure-Npm {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js/npm이 필요합니다: https://nodejs.org (22+ 권장)"
    exit 1
  }
}

function Install-NpmPkg([string]$pkg) {
  Write-Host "→ npm install -g $pkg"
  npm install -g $pkg
  if ($LASTEXITCODE -ne 0) { throw "npm install failed: $pkg" }
}

function Run-Login([string]$title, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host "=== $title 로그인 (브라우저 창이 열립니다) ==="
  & $cmd
}

Ensure-Npm

function Setup-Claude {
  try {
    irm https://claude.ai/install.ps1 | iex
  } catch {
    Install-NpmPkg "@anthropic-ai/claude-code"
  }
  Run-Login "Claude Code" { claude }
}

function Setup-Chatgpt {
  Install-NpmPkg "@openai/codex"
  Run-Login "Codex (ChatGPT)" { codex login }
}

function Setup-Gemini {
  Install-NpmPkg "@google/gemini-cli"
  Run-Login "Gemini" { gemini }
}

switch ($Provider) {
  "claude" { Setup-Claude }
  "chatgpt" { Setup-Chatgpt }
  "gemini" { Setup-Gemini }
  "all" {
    Write-Host "세 CLI를 순서대로 설치·로그인합니다."
    try { Setup-Claude } catch { Write-Warning $_ }
    try { Setup-Chatgpt } catch { Write-Warning $_ }
    try { Setup-Gemini } catch { Write-Warning $_ }
  }
}

Write-Host ""
Write-Host "완료. 크랩피치 웹 「내 AI」에서 스킬 프롬프트를 복사해 CLI/앱에 붙여넣으세요."
`;
